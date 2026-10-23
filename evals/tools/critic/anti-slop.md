# Anti-slop: what generated UI gets wrong, and what to do instead

"AI slop" UI is recognizable because it repeats the same defaults regardless of the product.
Each item below is banned in app UI unless the brief names a specific reason.
`[audit]` marks what `audit.mjs` detects automatically; the rest is for you and the critic.

## Visual decoration
| Slop | Instead |
|---|---|
| Purple/pink/blue gradients on backgrounds, buttons, text `[audit]` | Flat surfaces; the one brand hue on primary actions only |
| Glow, colored or large blurred shadows on cards `[audit]` | Borders and surface contrast (`canvas` vs `background`); shadows only on floating layers |
| Glassmorphism, blur backdrops on content | Opaque surfaces |
| Every section in its own rounded card with shadow | One panel per content region; spacing and dividers inside |
| `rounded-2xl`/`rounded-3xl` on everything | One base radius; pills only for badges/chips |
| Emoji as icons (🚀 ✨ 🔥 📊) `[audit]` | The project's icon set (lucide), only where an icon speeds recognition |
| An icon before every label, heading and menu item | Icons for navigation, status flags and icon-only buttons; text labels elsewhere |
| Colored icon tiles ("feature boxes") in app screens | Plain lists or tables |
| Raw palette classes `bg-blue-500`, `text-white`, hex `[audit]` | Semantic tokens, new tokens/variants when needed |
| Animations on load, hover-lift on rows/cards | Instant UI; transitions ≤ 150ms on state changes only |

## Information & layout
| Slop | Instead |
|---|---|
| Showing every API field as a column/row `[audit: >8 columns]` | Tier fields; 5–7 columns; merge related values; drawer for the rest |
| Equal visual weight for everything | One loudest element per region; muted secondary text |
| KPI cards with a number and no comparison or meaning | Number + period + delta/target, or remove the card |
| Hero/marketing structure on app screens (big centered headline, CTA banner) | Page header: title, one-line context, actions on the right |
| Centered layouts for data-heavy screens | Left-aligned, full-width content panels |
| Status as colored text or colored rows only | Badge with dot + label; icon + label for flags |
| Left-aligned or centered numbers, proportional digits `[audit]` | Right-aligned, `tabular-nums`, consistent decimals |
| Blank cells `[audit]` | `—` for none; explicit text for meaningful missing values |
| Huge page titles (36–48px) in tools | 20px title, 14px body |
| ALL CAPS headers/buttons (esp. Vietnamese) | Sentence case |
| Button rows with 4+ equal-weight buttons | One primary, the rest outline/ghost or in a menu |
| Dark mode toggle / theme features nobody asked for | Build the requested screen well, in both themes if the app has them |

## Content
| Slop | Instead |
|---|---|
| Lorem ipsum, "John Doe", "Acme", `example.com` `[audit]` | Realistic domain data in the product language, including long and missing values |
| Marketing voice in tools ("Supercharge your workflow!") | Plain, specific labels ("Tiếp nhận bệnh nhân") |
| Vague buttons ("Submit", "OK", "Get started") | Verb + object ("Lưu lịch hẹn", "Gửi nhắc lịch") |
| Exclamation marks, emoji in copy | Calm, specific copy |
| Generic empty states ("No data") | What will appear + the action that creates it |

## Process
| Slop | Instead |
|---|---|
| Coding before deciding | Brief first: surface type, v1 features, visual direction |
| Never looking at the result | Audit + screenshots + critic |
| Inventing a new component per screen | Reuse `components/ui`, add variants |
| Happy path only | All states from `patterns/states.md` |
| Fixing contrast by guessing | Measure (audit), then adjust tokens |
