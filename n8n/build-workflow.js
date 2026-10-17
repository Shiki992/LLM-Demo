// Generates northfield-lead-qualifier.json (n8n 2.x). Run: node n8n/build-workflow.js
const fs = require('fs');
const path = require('path');

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';
const lead = "$('New inquiry').item.json.body";
const scored = "$('Parse score').item.json";

const SCORE_SYSTEM = `You are a B2B lead-qualification analyst for Northfield Outfitters, an outdoor gear retailer with a team-sales desk (volume pricing from 10 units).

Score each inbound inquiry HOT, WARM or COLD using ONLY the inquiry and the company lookup provided. Never invent facts about the company or person.

HOT  = an organization with a concrete, near-term need (roughly within 3 months) for 10+ units, AND the contact has buying authority or a clear budget.
WARM = a plausible organizational fit, but vague timing, no budget yet, or the contact lacks authority.
COLD = an individual shopper or personal email, a single-unit purchase, or no business fit.

Respond with ONLY a JSON object, no markdown fences:
{"score":"hot|warm|cold","confidence":0.0-1.0,"summary":"Two sentences a rep can read in ten seconds.","reasons":["3 short reasons, each citing a specific fact from the inquiry or lookup"],"nextStep":"One short recommended action for the sales team."}`;

const SCORE_PROMPT = `=INQUIRY
Name: {{ ${lead}.name }}
Email: {{ ${lead}.email }}
Company (self-reported): {{ ${lead}.company || 'not given' }}
Role (self-reported): {{ ${lead}.role || 'not given' }}
Inquiry type: {{ ${lead}.inquiryType }}
Message: {{ ${lead}.message }}

COMPANY LOOKUP (from our directory)
{{ JSON.stringify($json, null, 2) }}`;

const DRAFT_SYSTEM = `You write short, warm outreach emails for Northfield Outfitters' team-sales reps. A rep will review and approve every email before it is sent.

Rules:
- Reference the exact items sitting in the customer's cart (product name, size and quantity).
- Answer the question they actually asked.
- Do NOT promise specific discounts, prices, stock levels or lead times that are not given to you. Say the rep will confirm volume pricing instead.
- Under 150 words. Friendly, specific, no hype.
- Sign off as: [Rep name], Team Sales, Northfield Outfitters

Respond with ONLY a JSON object, no markdown fences: {"subject":"...","body":"..."}`;

const DRAFT_PROMPT = `=CUSTOMER
{{ ${scored}.name }}, {{ ${scored}.role || 'role unknown' }} at {{ ${scored}.company || 'unknown company' }}

THEIR MESSAGE
{{ ${scored}.message }}

RESEARCH SUMMARY
{{ ${scored}.summary }}

ITEMS IN THEIR CART RIGHT NOW
{{ $('Check cart').item.json.items.map(i => '- ' + i.qty + ' x ' + i.name + ' (size ' + i.size + ') @ $' + i.price).join('\\n') }}
Cart total: \${{ $('Check cart').item.json.total }}`;

const PARSE_SCORE = `// The AI replied with text; turn it into fields the Switch can branch on.
const raw = $input.first().json.text ?? '';
let r;
try {
  r = JSON.parse((raw.match(/\\{[\\s\\S]*\\}/) || [raw])[0]);
} catch (e) {
  r = { score: 'warm', summary: 'AI output could not be parsed - review manually.', reasons: [raw.slice(0, 200)] };
}
const lead = $('New inquiry').first().json.body;
return [{
  json: {
    ...lead,
    score: String(r.score || 'warm').toLowerCase(),
    confidence: r.confidence ?? null,
    summary: r.summary || '',
    reasons: r.reasons || [],
    nextStep: r.nextStep || '',
  },
}];`;

const PARSE_DRAFT = `const raw = $input.first().json.text ?? '';
let d;
try {
  d = JSON.parse((raw.match(/\\{[\\s\\S]*\\}/) || [raw])[0]);
} catch (e) {
  d = { subject: 'Following up on your Northfield inquiry', body: raw };
}
return [{ json: { draft: { subject: d.subject || '', body: d.body || '' } } }];`;

function routeBody(route, withDraft) {
  return `={{ JSON.stringify({
  ticketId: ${scored}.ticketId,
  route: '${route}',
  score: ${scored}.score,
  summary: ${scored}.summary,
  reasons: ${scored}.reasons,
  nextStep: ${scored}.nextStep${withDraft ? ',\n  draft: $json.draft' : ''}
}) }}`;
}
function postRoute(id, name, pos, route, withDraft) {
  return {
    id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
    parameters: {
      method: 'POST',
      url: `={{ ${scored}.callbackBase }}/api/leads/route`,
      sendBody: true, specifyBody: 'json', jsonBody: routeBody(route, withDraft), options: {},
    },
  };
}
function claude(id, name, pos) {
  return {
    id, name, type: '@n8n/n8n-nodes-langchain.lmChatAnthropic', typeVersion: 1.3, position: pos,
    parameters: {
      model: { __rl: true, mode: 'id', value: MODEL },
      options: { temperature: 0.2, maxTokensToSample: 1024 },
    },
  };
}
function sticky(id, content, pos, width, height, color) {
  return { id, name: id, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: pos, parameters: { content, width, height, color } };
}

const nodes = [
  sticky('Note: trigger', '## 1 · Trigger\nA new inquiry arrives from the storefront form.', [-120, -80], 260, 380, 7),
  sticky('Note: research', '## 2 · AI research & score\nLook up the company, then ask the model: hot, warm or cold?', [180, -80], 700, 560, 5),
  sticky('Note: cart', '## 3 · Cart check\nA real lookup in the store — not an AI guess.', [920, -80], 260, 380, 4),
  sticky('Note: route', '## 4 · Route on both signals\nScore + cart decide the outcome.', [1220, -200], 940, 820, 6),

  { id: 'webhook', name: 'New inquiry', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: [-60, 100],
    webhookId: '6c1f7c0e-1f5a-4f5e-9d49-0b5f1f2a9e11',
    parameters: { httpMethod: 'POST', path: 'northfield-inquiry', responseMode: 'onReceived', options: {} } },

  { id: 'enrich', name: 'Look up company', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [240, 100],
    parameters: {
      url: `={{ $json.body.callbackBase }}/api/enrich`,
      sendQuery: true,
      queryParameters: { parameters: [
        { name: 'email', value: '={{ $json.body.email }}' },
        { name: 'ticketId', value: '={{ $json.body.ticketId }}' },
      ] },
      options: {},
    } },

  { id: 'score', name: 'AI · Research & score', type: '@n8n/n8n-nodes-langchain.chainLlm', typeVersion: 1.7, position: [480, 100],
    parameters: { promptType: 'define', text: SCORE_PROMPT, messages: { messageValues: [{ message: SCORE_SYSTEM }] } } },
  claude('model1', 'Claude (scoring)', [480, 320]),

  { id: 'parse', name: 'Parse score', type: 'n8n-nodes-base.code', typeVersion: 2, position: [720, 100],
    parameters: { jsCode: PARSE_SCORE } },

  { id: 'cart', name: 'Check cart', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [980, 100],
    parameters: {
      url: `={{ $json.callbackBase }}/api/cart/lookup`,
      sendQuery: true,
      queryParameters: { parameters: [
        { name: 'email', value: '={{ $json.email }}' },
        { name: 'ticketId', value: '={{ $json.ticketId }}' },
      ] },
      options: {},
    } },

  { id: 'switch', name: 'Hot? Cart?', type: 'n8n-nodes-base.switch', typeVersion: 3.2, position: [1260, 100],
    parameters: {
      rules: { values: [
        { renameOutput: true, outputKey: 'Hot + cart',
          conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'loose', version: 2 }, combinator: 'and', conditions: [
            { id: 'c1', leftValue: `={{ ${scored}.score }}`, rightValue: 'hot', operator: { type: 'string', operation: 'equals' } },
            { id: 'c2', leftValue: '={{ $json.hasCart }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } },
          ] } },
        { renameOutput: true, outputKey: 'Hot, no cart',
          conditions: { options: { caseSensitive: false, leftValue: '', typeValidation: 'loose', version: 2 }, combinator: 'and', conditions: [
            { id: 'c3', leftValue: `={{ ${scored}.score }}`, rightValue: 'hot', operator: { type: 'string', operation: 'equals' } },
          ] } },
      ] },
      options: { fallbackOutput: 'extra', renameFallbackOutput: 'Warm or cold' },
    } },

  { id: 'draft', name: 'AI · Draft outreach', type: '@n8n/n8n-nodes-langchain.chainLlm', typeVersion: 1.7, position: [1520, -60],
    parameters: { promptType: 'define', text: DRAFT_PROMPT, messages: { messageValues: [{ message: DRAFT_SYSTEM }] } } },
  claude('model2', 'Claude (writing)', [1520, 160]),
  { id: 'parseDraft', name: 'Parse draft', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1760, -60],
    parameters: { jsCode: PARSE_DRAFT } },
  postRoute('approve', 'Send to rep for approval', [1980, -60], 'approval', true),

  postRoute('rep', 'Route to rep queue', [1520, 340], 'rep', false),
  postRoute('nurture', 'Enroll in nurture sequence', [1520, 500], 'nurture', false),
];

const main = (...targets) => ({ main: targets.map(t => (t ? [{ node: t, type: 'main', index: 0 }] : [])) });
const connections = {
  'New inquiry': main('Look up company'),
  'Look up company': main('AI · Research & score'),
  'AI · Research & score': main('Parse score'),
  'Parse score': main('Check cart'),
  'Check cart': main('Hot? Cart?'),
  'Hot? Cart?': main('AI · Draft outreach', 'Route to rep queue', 'Enroll in nurture sequence'),
  'AI · Draft outreach': main('Parse draft'),
  'Parse draft': main('Send to rep for approval'),
  'Claude (scoring)': { ai_languageModel: [[{ node: 'AI · Research & score', type: 'ai_languageModel', index: 0 }]] },
  'Claude (writing)': { ai_languageModel: [[{ node: 'AI · Draft outreach', type: 'ai_languageModel', index: 0 }]] },
};

const workflow = {
  id: 'nfLeadQualify001',
  name: 'Northfield · Lead qualifier + cart check',
  nodes, connections,
  settings: { executionOrder: 'v1' },
  pinData: {},
  active: false,
};
const out = path.join(__dirname, 'northfield-lead-qualifier.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2));
console.log('wrote', out, `(model: ${MODEL})`);
