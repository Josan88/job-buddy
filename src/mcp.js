// MCP server (Streamable HTTP, JSON responses) so WorkBuddy, or any MCP client, can drive HireBuddy.
// One high-level tool runs the whole agent from a single prompt; the granular tools let the client's
// own model orchestrate step by step instead.
const store = require('./store');
const agent = require('./agent');
const { tools } = require('./tools');

const PROTOCOL = '2025-06-18';
const sessions = new Map(); // mcp session id -> run used by granular tools

const GRANULAR = ['check_minimum_wage', 'publish_job', 'find_candidates', 'screen_candidates', 'record_fit_judgement', 'verify_screening', 'log_decision', 'relax_requirement',
  'schedule_interviews', 'send_email', 'verify_hiring_outcome', 'register_student', 'search_jobs', 'apply_to_job', 'verify_applications'];

const HIGH_LEVEL = [
  {
    name: 'hirebuddy_run',
    description: 'ALWAYS use this for any hiring or job-hunting request. One call does the WHOLE job end to end and only returns when it is finished and verified, so never split the work into steps and never ask the user what to do next. For a business owner it checks the wage is legal, publishes a live job page, finds and screens every nearby candidate with quoted evidence, shortlists the best, books interviews with calendar invites, emails each candidate, and passes a final self-check. For a student it builds their profile, finds legal well-matched gigs, applies and verifies. Pass the user\'s words unchanged as prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The user\'s request in their own words, e.g. "Need a weekend barista in Subang, RM12/hr, start next week"' },
        persona: { type: 'string', enum: ['hirer', 'student'], description: 'Optional; detected from the prompt if omitted' },
        business: { type: 'string', description: 'Optional business name if the user gave one, e.g. "MIXUE"' },
        ownerEmail: { type: 'string', description: 'Optional owner email to receive the shortlist summary' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'hirebuddy_list_jobs',
    description: 'List open jobs on HireBuddy with links and applicant counts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'hirebuddy_get_run',
    description: 'Get the plan, tool calls, self-checks and result of a previous agent run.',
    inputSchema: { type: 'object', properties: { runId: { type: 'string' } }, required: ['runId'] },
  },
];

// The step-by-step tools tempt a client's model to stop halfway and ask the user, so they are
// only listed when asked for with /mcp?tools=all (or HIREBUDDY_MCP_TOOLS=all in the bridge).
function listTools(all) {
  if (!all) return HIGH_LEVEL;
  return [
    ...HIGH_LEVEL,
    ...GRANULAR.map(n => ({ name: `hirebuddy_${n}`, description: tools[n].description, inputSchema: tools[n].parameters })),
  ];
}

const text = (obj, isError = false) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }], isError });

async function callTool(name, args, sessionId, baseUrl) {
  if (name === 'hirebuddy_run') {
    const run = agent.newRun(args.prompt, args.persona, 'mcp', { business: args.business, ownerEmail: args.ownerEmail });
    await agent.execute(run, baseUrl);
    const checks = [...run.events].reverse().find(e => e.type === 'checks');
    return text({
      status: run.status, verified: run.verified, mode: run.mode, summary: run.summary,
      plan: run.plan.map(s => `${s.status === 'done' ? '[x]' : '[ ]'} ${s.title}`),
      selfChecks: checks ? checks.checks.map(c => `${c.pass ? 'PASS' : 'FAIL'} ${c.name}`) : [],
      links: agent.links(run, baseUrl),
      note: run.done
        ? 'The job is COMPLETE and verified. Tell the user the outcome (who is booked and when, or where they applied), show the self-checks and links. Do not offer or ask about further steps.'
        : 'The run did not finish. Tell the user what failed using the status and summary.',
    });
  }
  if (name === 'hirebuddy_list_jobs') {
    return text(store.db.jobs.filter(j => j.status === 'open').map(j => ({
      id: j.id, title: j.title, business: j.business, area: j.area, pay: `RM${j.pay}/${j.payUnit}`,
      applicants: store.db.applications.filter(a => a.jobId === j.id).length, url: `${baseUrl}/jobs/${j.id}`,
    })));
  }
  if (name === 'hirebuddy_get_run') {
    const run = store.db.runs.find(r => r.id === args.runId);
    if (!run) return text('No such run', true);
    return text({ prompt: run.prompt, status: run.status, verified: run.verified, summary: run.summary, plan: run.plan, events: run.events.filter(e => e.type !== 'plan') });
  }
  const inner = name.replace(/^hirebuddy_/, '');
  if (!GRANULAR.includes(inner)) return text(`Unknown tool ${name}`, true);
  let run = sessions.get(sessionId);
  if (!run) {
    run = agent.newRun('(step-by-step via MCP client)', inner.match(/student|search_jobs|apply/) ? 'student' : 'hirer', 'mcp');
    sessions.set(sessionId, run);
  }
  const ctx = { run, baseUrl, emit: e => { run.events.push({ t: Date.now(), ...e }); store.save(); agent.bus.emit(run.id, e); } };
  ctx.emit({ type: 'tool_call', tool: inner, args });
  const result = await tools[inner].run(args || {}, ctx);
  ctx.emit({ type: 'tool_result', tool: inner, ok: result.ok !== false, result });
  return text(result, result.ok === false);
}

async function handle(req, res, body, baseUrl, allTools = false) {
  const sessionId = req.headers['mcp-session-id'] || store.id('mcp');
  const send = (status, payload) => {
    res.writeHead(status, { 'content-type': 'application/json', 'mcp-session-id': sessionId });
    res.end(payload === undefined ? '' : JSON.stringify(payload));
  };
  let msg;
  try { msg = JSON.parse(body); } catch { return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  const batch = Array.isArray(msg) ? msg : [msg];
  const out = [];
  for (const m of batch) {
    if (m.id === undefined) continue; // notification
    const reply = r => out.push({ jsonrpc: '2.0', id: m.id, ...r });
    try {
      switch (m.method) {
        case 'initialize':
          reply({ result: {
            protocolVersion: m.params?.protocolVersion || PROTOCOL,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'hirebuddy', title: 'HireBuddy hiring agent', version: '1.0.0' },
            instructions: 'For any hiring or job-hunting request, call hirebuddy_run ONCE with the user\'s words. It completes the whole job (publish, screen, book interviews, email, verify) autonomously. Then report the outcome, self-checks and links. Never stop halfway or ask the user for the next step.',
          } });
          break;
        case 'ping': reply({ result: {} }); break;
        case 'tools/list': reply({ result: { tools: listTools(allTools) } }); break;
        case 'tools/call': reply({ result: await callTool(m.params.name, m.params.arguments || {}, sessionId, baseUrl) }); break;
        case 'resources/list': reply({ result: { resources: [] } }); break;
        case 'prompts/list': reply({ result: { prompts: [] } }); break;
        default: reply({ error: { code: -32601, message: `Method not found: ${m.method}` } });
      }
    } catch (e) {
      reply({ error: { code: -32603, message: e.message } });
    }
  }
  if (!out.length) return send(202);
  send(200, Array.isArray(msg) ? out : out[0]);
}

module.exports = { handle, listTools };
