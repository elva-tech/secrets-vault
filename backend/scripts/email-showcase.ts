#!/usr/bin/env node
/**
 * Safe ELVA Vault email showcase — inventory, render-only, or live send to allowlisted inbox only.
 *
 * Usage:
 *   npm run email-showcase -- --inventory
 *   npm run email-showcase -- --render
 *   npm run email-showcase -- --send
 */
import { loadAppDotenv } from '../src/config/load-dotenv.js';
import {
  allShowcaseDefinitions,
  SHOWCASE_ALLOWED_RECIPIENT,
} from '../src/modules/notifications/email-showcase.catalog.js';
import {
  assertShowcaseRecipient,
  listSendableShowcase,
  renderShowcaseEmail,
  sendShowcaseEmail,
} from '../src/modules/notifications/email-showcase.runner.js';

loadAppDotenv();

const args = new Set(process.argv.slice(2));
const inventory = args.has('--inventory') || (!args.has('--render') && !args.has('--send'));
const render = args.has('--render') || args.has('--send');
const send = args.has('--send');

function printInventory(): void {
  console.log('Secrets Vault — email notification inventory\n');
  console.log(
    '| Event | Purpose | Recipient | Subject (base) | Source | Enabled | Showcase | Group |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const def of allShowcaseDefinitions()) {
    const { subject } = def.buildPayload();
    console.log(
      `| ${def.identifier} | ${def.purpose} | ${def.recipientCategory} | ${subject} | ${def.sourceFile} | ${def.enabled} | ${def.canSendLive ? 'yes' : 'no'} | ${def.safetyGroup} |`,
    );
    if (def.notes) console.log(`  _Note:_ ${def.notes}`);
  }
  console.log(`\nAllowlisted showcase recipient: ${SHOWCASE_ALLOWED_RECIPIENT}`);
}

async function main(): Promise<void> {
  assertShowcaseRecipient(SHOWCASE_ALLOWED_RECIPIENT);

  if (inventory) {
    printInventory();
  }

  if (render && !send) {
    console.log('\n--- Render-only previews (no delivery) ---\n');
    for (const def of listSendableShowcase()) {
      const rendered = renderShowcaseEmail(def);
      console.log(`[${rendered.identifier}] ${rendered.subject}`);
      console.log(rendered.textPreview);
      console.log(`(text ${rendered.textLength} chars, html ${rendered.htmlLength} chars)\n`);
    }
    for (const def of allShowcaseDefinitions().filter((d) => !d.canSendLive)) {
      const rendered = renderShowcaseEmail(def);
      console.log(`[${rendered.identifier}] RENDER-ONLY — ${rendered.subject}`);
      console.log(rendered.textPreview);
      console.log('');
    }
  }

  if (send) {
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    console.log(`\n--- Live showcase send (run ${runId}) ---\n`);
    const sendable = listSendableShowcase();
    const results: Awaited<ReturnType<typeof sendShowcaseEmail>>[] = [];
    for (const def of sendable) {
      try {
        const result = await sendShowcaseEmail(def, runId);
        results.push(result);
        console.log(
          `SENT ${result.identifier}: provider=${result.provider} status=${result.status} messageId=${result.messageId ?? 'n/a'} correlationId=${result.correlationId}`,
        );
      } catch (err) {
        console.log(`FAILED ${def.identifier}: ${(err as Error).message}`);
      }
    }
    console.log(
      `\nCompleted: ${results.length}/${sendable.length} provider-accepted sends to ${SHOWCASE_ALLOWED_RECIPIENT}.`,
    );
    console.log('Inbox delivery is not independently verified.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
