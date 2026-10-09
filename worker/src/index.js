// 無限ゴーレム工房 オンライン中継サーバー
// 部屋ごとに1つのDurable Objectを使い、ホストとゲストのメッセージを中継するだけ。
// ゲームの進行はホストのブラウザが担当する。

const MAX_SOCKETS = 8;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/room\/([A-Z0-9]{4,8})$/);
    if (m) return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
    return new Response('golem-works relay ok', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.host = undefined;
    // pingは起こさずに自動で返す
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async getHost() {
    if (this.host === undefined) this.host = (await this.ctx.storage.get('host')) || null;
    return this.host;
  }

  live(except) {
    return this.ctx.getWebSockets()
      .filter((w) => w !== except)
      .map((w) => ({ w, a: w.deserializeAttachment() }))
      .filter((x) => x.a && x.a.cid);
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const url = new URL(req.url);
    const cid = (url.searchParams.get('cid') || '').slice(0, 40);
    const name = (url.searchParams.get('name') || '').slice(0, 12) || '名無し';
    const create = url.searchParams.get('create') === '1';

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const fail = (e) => {
      server.send(JSON.stringify({ t: 'error', e }));
      server.close(4000, e);
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!cid) return fail('bad');

    let host = await this.getHost();
    const others = this.live(server);
    if (create) {
      if (host && host !== cid && others.some((x) => x.a.cid === host)) return fail('taken');
      host = cid;
      this.host = cid;
      await this.ctx.storage.put('host', cid);
    } else if (!host) {
      return fail('noroom');
    }
    // 同じ人の古い接続は閉じる
    for (const x of others) if (x.a.cid === cid) { try { x.w.close(4001, 'dup'); } catch (e) {} }
    const rest = others.filter((x) => x.a.cid !== cid);
    if (cid !== host && rest.length >= MAX_SOCKETS) return fail('full');

    server.serializeAttachment({ cid, name });
    server.send(JSON.stringify({ t: 'hello', host, cid }));
    await this.roster();
    return new Response(null, { status: 101, webSocket: client });
  }

  async roster(except) {
    const host = await this.getHost();
    const members = this.live(except).map((x) => ({ cid: x.a.cid, name: x.a.name }));
    this.broadcast(JSON.stringify({ t: 'roster', host, members }), except);
  }

  broadcast(msg, except, onlyNot) {
    for (const x of this.live(except)) {
      if (onlyNot && x.a.cid === onlyNot) continue;
      try { x.w.send(msg); } catch (e) {}
    }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string') return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const a = ws.deserializeAttachment();
    if (!a) return;
    const host = await this.getHost();
    if (m.t === 'state' && a.cid === host) {
      this.broadcast(JSON.stringify({ t: 'state', s: m.s }), ws, host);
    } else if (m.t === 'act' && a.cid !== host) {
      const h = this.live().find((x) => x.a.cid === host);
      if (h) h.w.send(JSON.stringify({ t: 'act', from: a.cid, a: m.a, d: m.d }));
    } else if (m.t === 'close' && a.cid === host) {
      this.broadcast(JSON.stringify({ t: 'hostgone' }), ws);
      this.host = null;
      await this.ctx.storage.deleteAll();
      for (const x of this.live()) { try { x.w.close(1000, 'closed'); } catch (e) {} }
    }
  }

  async webSocketClose(ws) {
    await this.roster(ws);
  }

  async webSocketError(ws) {
    await this.roster(ws);
  }
}
