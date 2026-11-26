import Link from "next/link";
import Icon from "@/components/admin/Icon";
import PageHeader from "@/components/admin/PageHeader";
import { requireUser } from "@/lib/auth";
import { fmtShort, todayIST } from "@/lib/dates";
import { MAIN_MODEL, USE_FAKE } from "@/lib/assistant/model";
import { formatInr, USD_INR } from "@/lib/assistant/prices";
import { DAYS, type Totals, usageReport } from "@/lib/assistant/usageReport";

export const metadata = { title: "Assistant usage" };

const OUTCOMES = { answered: "Answered", off_topic: "Off topic", stopped: "Stopped", failed: "Failed" } as const;
const PURPOSES: Record<string, string> = { answer: "Answers (model and tools)", guard: "Off-topic check", title: "Chat titles" };

const num = (n: number) => n.toLocaleString("en-IN");
const secs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} s`);
/** Share of input tokens Google had cached (charged at a tenth of the price) */
const cachedShare = (t: Pick<Totals, "input" | "cached">) => (t.input ? `${Math.round((t.cached / t.input) * 100)}%` : "—");

/**
 * Annapurna Assist's usage (8.3), for the super admin: how many questions, how many tokens, how long answers take,
 * and what it would all cost on Gemini's paid tier. We use the free tier, so the real cost is ₹0.
 */
export default async function AssistantUsagePage() {
  await requireUser("viewAssistantUsage");
  const today = todayIST();
  const { totals, today: now, byDay, byAdmin, byPurpose, recent } = await usageReport(today);
  const perQuestion = totals.questions ? totals.inr / totals.questions : 0;

  const tiles = [
    { label: "Questions", value: num(totals.questions), sub: `${num(now.questions)} today`, icon: "sparkle" as const, tone: "gold" },
    {
      label: "Would cost (paid tier)",
      value: formatInr(totals.inr),
      sub: `${formatInr(perQuestion)} a question · real cost ₹0`,
      icon: "rupee" as const,
      tone: "green",
    },
    {
      label: "Tokens",
      value: num(totals.input + totals.output),
      sub: `${num(totals.input)} in (${cachedShare(totals)} cached) · ${num(totals.output)} out`,
      icon: "chart" as const,
      tone: "navy",
    },
    { label: "Answer time", value: secs(totals.total), sub: `first words after ${secs(totals.firstText)}`, icon: "clock" as const, tone: "plum" },
  ];

  return (
    <main className="ap-page as-usage">
      <PageHeader
        title="Assistant usage"
        subtitle={`Annapurna Assist over the last ${DAYS} days: questions, tokens, answer times, and what it would cost on Gemini's paid tier.`}
      />
      <p className="ap-hint">
        <Link href="/admin/assistant" className="ap-link">
          ← Back to Annapurna Assist
        </Link>{" "}
        · Answers by <strong>{USE_FAKE ? "the test models (ASSISTANT_FAKE=1), priced as Flash-Lite" : MAIN_MODEL}</strong>. We use
        Google&apos;s free tier, so nothing is charged; the costs are Google&apos;s paid prices of 18 Nov 2026 at ₹{USD_INR} to the
        dollar (lib/assistant/prices.ts).
        {totals.incomplete && " Some calls used a model the price table doesn't have, so the totals are too low."}
      </p>

      <section className="ap-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="ap-tile">
            <span className={`ap-tile-icon is-${t.tone}`}>
              <Icon name={t.icon} size={20} />
            </span>
            <span className="ap-tile-label">{t.label}</span>
            <strong className="ap-tile-value">{t.value}</strong>
            <span className="xp-tilesub">{t.sub}</span>
          </div>
        ))}
      </section>

      {totals.questions === 0 ? (
        <section className="ap-panel">
          <p className="ap-empty-sm">No questions in the last {DAYS} days yet. Ask Annapurna Assist something, then come back.</p>
        </section>
      ) : (
        <>
          <div className="ap-grid-2">
            <section className="ap-panel">
              <div className="ap-panel-head">
                <h2>Where the tokens go</h2>
                <span className="ap-muted">by kind of model call</span>
              </div>
              <div className="xp-tablewrap">
                <table className="xp-table">
                  <thead>
                    <tr>
                      <th>Call</th>
                      <th>Calls</th>
                      <th>Tokens in</th>
                      <th>Tokens out</th>
                      <th>Would cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byPurpose.map((p) => (
                      <tr key={p.purpose}>
                        <td>{PURPOSES[p.purpose] ?? p.purpose}</td>
                        <td data-label="Calls">{num(p.calls)}</td>
                        <td data-label="Tokens in">{num(p.input)}</td>
                        <td data-label="Tokens out">{num(p.output)}</td>
                        <td data-label="Would cost" className="xp-nowrap">{formatInr(p.inr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="ap-panel">
              <div className="ap-panel-head">
                <h2>By admin</h2>
                <span className="ap-muted">last {DAYS} days</span>
              </div>
              <div className="xp-tablewrap">
                <table className="xp-table">
                  <thead>
                    <tr>
                      <th>Admin</th>
                      <th>Questions</th>
                      <th>Off topic</th>
                      <th>Failed</th>
                      <th>Would cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byAdmin.map((a) => (
                      <tr key={a.name}>
                        <td>{a.name}</td>
                        <td data-label="Questions">{num(a.questions)}</td>
                        <td data-label="Off topic">{num(a.offTopic)}</td>
                        <td data-label="Failed">{num(a.failed)}</td>
                        <td data-label="Would cost" className="xp-nowrap">{formatInr(a.inr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="ap-panel">
            <div className="ap-panel-head">
              <h2>By day</h2>
              <span className="ap-muted">India time</span>
            </div>
            <div className="xp-tablewrap">
              <table className="xp-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Questions</th>
                    <th>Model calls</th>
                    <th>Tokens in</th>
                    <th>Cached</th>
                    <th>Tokens out</th>
                    <th>Answer time</th>
                    <th>Would cost</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.map((d) => (
                    <tr key={d.day}>
                      <td className="xp-nowrap">{d.day === today ? "Today" : fmtShort(d.day)}</td>
                      <td data-label="Questions">{num(d.questions)}</td>
                      <td data-label="Model calls">{num(d.calls)}</td>
                      <td data-label="Tokens in">{num(d.input)}</td>
                      <td data-label="Cached">{cachedShare(d)}</td>
                      <td data-label="Tokens out">{num(d.output)}</td>
                      <td data-label="Answer time">{secs(d.total)}</td>
                      <td data-label="Would cost" className="xp-nowrap">{formatInr(d.inr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="ap-panel">
            <div className="ap-panel-head">
              <h2>Latest questions</h2>
              <span className="ap-muted">the questions themselves stay in each admin&apos;s chats</span>
            </div>
            <div className="xp-tablewrap">
              <table className="xp-table as-usage-recent">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Admin</th>
                    <th>Outcome</th>
                    <th>Tools</th>
                    <th>Calls</th>
                    <th>Tokens in / out</th>
                    <th>First words</th>
                    <th>Total</th>
                    <th>Would cost</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td className="xp-nowrap">
                        {r.day === today ? "Today" : fmtShort(r.day)} {r.time}
                      </td>
                      <td data-label="Admin">{r.name}</td>
                      <td data-label="Outcome">{OUTCOMES[r.outcome]}</td>
                      <td data-label="Tools">{r.tools.length ? r.tools.join(", ") : "—"}</td>
                      <td data-label="Calls">{r.calls.length}</td>
                      <td data-label="Tokens in / out" className="xp-nowrap">
                        {num(r.input_tokens)} / {num(r.output_tokens)}
                      </td>
                      <td data-label="First words">{secs(r.first_text_ms)}</td>
                      <td data-label="Total">{secs(r.total_ms)}</td>
                      <td data-label="Would cost" className="xp-nowrap">{formatInr(r.inr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
