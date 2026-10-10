#!/usr/bin/env node
// stdio <-> HTTP bridge so desktop agents that launch MCP servers as commands (WorkBuddy, CodeBuddy,
// Claude Desktop...) can use the hosted HireBuddy MCP endpoint. No dependencies; Node 18+.
// Usage: HIREBUDDY_URL=https://your-app.onrender.com node hirebuddy-mcp.js
const readline = require('readline');
const BASE = (process.env.HIREBUDDY_URL || process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
let session = null;

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  try {
    const r = await fetch(`${BASE}/mcp${process.env.HIREBUDDY_MCP_TOOLS === 'all' ? '?tools=all' : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(session ? { 'mcp-session-id': session } : {}) },
      body: JSON.stringify(msg),
    });
    session = r.headers.get('mcp-session-id') || session;
    const text = await r.text();
    if (text.trim()) process.stdout.write(text.trim() + '\n');
  } catch (e) {
    if (msg.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: `HireBuddy unreachable at ${BASE}: ${e.message}` } }) + '\n');
  }
});
