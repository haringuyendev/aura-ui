# Critique rubric

Used by you (self-check) and by the `ui-critic` agent. Score each dimension **0–3** from the
screenshots, the expected decisions and, when needed, the code. Every score below 3 needs evidence
(which screenshot, which element) and a concrete fix.

| # | Dimension | 0 | 1 | 2 | 3 |
|---|---|---|---|---|---|
| 1 | **Task fit**: does the screen serve the primary task in the expected decisions? | Primary task is hard or impossible | Possible but buried | Clear path, minor friction | The primary task is the most obvious thing on the screen |
| 2 | **Information priority**: right fields, right tiers | Dumps fields; irrelevant data visible | Some noise or missing key fields | Mostly right; 1–2 tier mistakes | Every visible field earns its place; on-demand data is one click away |
| 3 | **Hierarchy**: squint test | Everything equally loud or noisy | Competing focal points | Clear first focus, second level muddy | Clear first/second/third levels in every region |
| 4 | **Layout & alignment** | Misaligned, cramped or sprawling | Inconsistent gaps/alignment | Consistent with small slips | Grid-aligned, consistent rhythm, numbers right-aligned, widths intentional |
| 5 | **Data formatting** | Raw values (ISO dates, unformatted numbers) | Mixed formats | Correct formats, minor gaps | Locale formats, tabular figures, meaningful empties, smart merges |
| 6 | **Visual restraint (anti-slop)** | Several items from `anti-slop.md` | One or two prominent slop items | Restrained with a minor flourish | Neutral-first, one brand hue, nothing decorative |
| 7 | **States & edge cases** | Happy path only | Some states, generic | All states, some generic copy | All states, specific copy, long values handled |
| 8 | **Responsive** | Breaks or hides primary data on small screens | Usable with horizontal scroll of key data | Adapts, small issues | Deliberate per-breakpoint behavior; primary fields always visible |
| 9 | **Accessibility** | Fails basics (contrast, labels, focus) | Several gaps | Minor gaps | Audit clean, keyboard path works, status not by color alone |
| 10 | **Consistency with the system** | Ad hoc styles everywhere | Many one-offs | Mostly tokens/variants | Tokens and existing components only; new needs added as variants |
| 11 | **Fit to task**: designed for this job, not a generic template | A stock dashboard/admin template with this domain's labels pasted in | Generic structure; few choices trace to the user or task | Most structure derived from the brief | Every visible choice traces to this job's user, task, density, device or brand |

**Pass:** every dimension ≥ 2 and no 0s. **Ship-quality:** average ≥ 2.6.

## How to look (in this order)
1. Blur/squint the desktop "ready" screenshot: where does the eye go first? Is that the primary task?
2. Read the expected decisions's primary task and fields; tick each primary field on screen; look for
   anything on screen that isn't in the record.
3. Scan one column at a time: alignment, format, truncation, empty values.
4. Check tablet and mobile, then each state screenshot.
5. Read `report.md` from the audit; anything HIGH caps dimension 9 at 1.

## Output format
```markdown
## Scores
| Dimension | Score | Evidence |
|---|---|---|
| Task fit | 2 | ready-1440: primary action visible, but "Waiting" view is the 3rd tab… |
…
**Average:** 2.4 · **Pass:** yes/no

## Top fixes (ranked by impact)
1. <What's wrong> → <exact change> (<file/selector if known>) [dimension]
2. …

## Keep
- <what is working and must not regress>
```
