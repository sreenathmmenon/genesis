# Genesis Use Cases — Master Reference

## Intelligence & Monitoring

| # | Use Case | Intent | Output | Tools | Pre-AI possible? |
|---|---|---|---|---|---|
| 1 | Monitor HN for keywords | Alert me when HN posts mention my product name | Telegram message with link + score | web_search, telegram_send | Yes (IFTTT/RSS) |
| 2 | Track competitor pricing changes | Check Stripe pricing page weekly for changes | Diff of pricing tiers on Telegram | http_request, telegram_send | Partially (manual) |
| 3 | Competitor changelog monitor | Every Monday brief me on Vercel/Netlify changelogs | Structured weekly brief on Telegram | web_search, telegram_send | Yes (RSS) |
| 4 | GitHub star tracker | Alert when a repo crosses 1k/5k/10k stars | Telegram alert with milestone | github_api, telegram_send | Yes (webhooks) |
| 5 | Job posting intelligence | Track when Anthropic posts new AI research jobs | Weekly Telegram summary of new postings | web_search, telegram_send | Yes (RSS/job alerts) |
| 6 | Product Hunt daily digest | Every morning, top 5 launches from Product Hunt | Telegram list with name, tagline, votes | web_search, telegram_send | Yes (RSS) |
| 7 | Reddit keyword monitor | Alert me when r/MachineLearning mentions LangGraph | Telegram alert with post title + link | web_search, telegram_send | Yes (IFTTT) |
| 8 | Tech blog digest | Every Friday, summarise new posts from Paul Graham, Simon Willison | Weekly reading list on Telegram | web_search, telegram_send | Yes (RSS) |
| 9 | VC funding tracker | Alert me when any AI startup raises Series A+ | Daily Telegram alert | web_search, telegram_send | Yes (Crunchbase alerts) |
| 10 | Twitter/X thread digest | Summarise top AI threads from today | Daily Telegram summary | web_search, telegram_send | No (summarisation is AI) |
| 11 | Patent filing monitor | Alert me when a competitor files AI-related patents | Telegram alert with filing summary | web_search, telegram_send | Partially |
| 12 | G2 review monitor | Alert me when my product gets a new 1-star review | Telegram alert with review text | web_search, telegram_send | Yes (G2 notifications) |
| 13 | Google Trends tracker | Weekly report on search trend for 'AI agents' | Trend summary on Telegram | web_search, telegram_send | Yes (Trends alerts) |
| 14 | Arxiv paper monitor | Daily digest of new LLM papers on arxiv | Telegram list with titles + abstracts | web_search, telegram_send | Yes (arxiv email digest) |
| 15 | SEC filing tracker | Alert when Apple/Microsoft files a major SEC document | Telegram alert with filing type | http_request, telegram_send | Yes (EDGAR alerts) |

## Engineering & DevOps

| # | Use Case | Intent | Output | Tools | Pre-AI possible? |
|---|---|---|---|---|---|
| 16 | PR API contract monitor | Detect API-breaking changes in any PR before merge | Telegram alert with diff + risk level | github_api, telegram_send | Partially (linters, no risk reasoning) |
| 17 | Stale PR cleanup alert | Alert every Monday about PRs open > 7 days | Telegram list with PR age and author | github_api, telegram_send | Yes (GitHub filters) |
| 18 | Failed CI/CD alert | Alert when CI fails on main branch | Telegram with build log excerpt | github_api, telegram_send | Yes (GitHub Actions notify) |
| 19 | Dependency vulnerability scan | Weekly scan of package.json for known CVEs | Telegram report of CVEs found | github_api, web_search, telegram_send | Yes (Dependabot) |
| 20 | Code review reminder | Remind reviewers every 4 hours about pending reviews | Telegram reminder per reviewer | github_api, telegram_send | Yes (GitHub reminders) |
| 21 | Release notes generator | When a new release is tagged, draft release notes | Telegram with auto-drafted notes | github_api, telegram_send | No (drafting is AI) |
| 22 | Branch hygiene monitor | Alert about branches not merged after 30 days | Weekly Telegram list of stale branches | github_api, telegram_send | Yes (scripts) |
| 23 | Issue triage agent | Every day, label and prioritize new GitHub issues | Issues tagged, Telegram summary | github_api, telegram_send | No (prioritisation is AI) |
| 24 | License compliance checker | Check all new PRs for GPL-licensed dependencies | Telegram flag if GPL found | github_api, web_search, telegram_send | Partially (FOSSA etc) |
| 25 | API uptime monitor | Check my API endpoint every 5 minutes, alert if down | Telegram alert on failure | http_request, telegram_send | Yes (PagerDuty/Pingdom) |
| 26 | SSL cert expiry monitor | Alert 30 days before any SSL cert expires | Telegram alert with domain + days left | http_request, telegram_send | Yes (cert monitors) |
| 27 | Changelog auto-generator | Every week, create changelog from merged PRs | Telegram or file with changelog | github_api, telegram_send | No (writing is AI) |
| 28 | Test coverage reporter | Weekly: which modules dropped below 80% coverage | Telegram with coverage delta | github_api, telegram_send | Yes (Codecov) |
| 29 | Docker image scan | Alert when a new critical CVE affects our base image | Telegram alert with CVE details | web_search, http_request, telegram_send | Partially (Snyk) |
| 30 | Commit message quality check | Flag commits that don't follow conventional commits | Telegram alert per bad commit | github_api, telegram_send | Yes (commit-lint hooks) |

## Business Operations

| # | Use Case | Intent | Output | Tools | Pre-AI possible? |
|---|---|---|---|---|---|
| 31 | Daily revenue summary | Every morning, fetch yesterday's MRR and brief me | Telegram with MRR, subs, churn | http_request, telegram_send | Yes (Stripe dashboard) |
| 32 | Churn risk alert | Alert when a paying user hasn't logged in for 14 days | Telegram with user list | http_request, telegram_send | Yes (custom scripts) |
| 33 | Support ticket escalation | Alert immediately for urgent support tickets | Telegram with ticket summary | http_request, telegram_send | Yes (Intercom rules) |
| 34 | SLA breach monitor | Alert when support ticket exceeds 4-hour response SLA | Telegram with overdue tickets | http_request, telegram_send | Yes (Zendesk SLA) |
| 35 | Weekly KPI digest | Every Monday, compile signups, activations, revenue | Telegram structured KPI table | http_request, telegram_send | Yes (dashboards) |
| 36 | Refund spike detector | Alert if refund rate exceeds 5% in 24h window | Telegram alert with rate | http_request, telegram_send | Yes (Stripe webhooks) |
| 37 | Invoice overdue reminder | Alert daily about invoices overdue > 7 days | Telegram list with customer + amount | http_request, telegram_send | Yes (accounting software) |
| 38 | Trial conversion tracker | Alert when trial user hasn't converted after 13 days | Telegram with user name + date | http_request, telegram_send | Yes (CRM automation) |
| 39 | Feature flag usage report | Weekly: which feature flags have 0 usage? | Telegram report of dead flags | http_request, telegram_send | Yes (LaunchDarkly reports) |
| 40 | Social mention monitor | Alert when someone mentions brand on any public forum | Telegram with post snippet + link | web_search, telegram_send | Yes (Mention.com) |

## Content & Research

| # | Use Case | Intent | Output | Tools | Pre-AI possible? |
|---|---|---|---|---|---|
| 41 | Blog content brief generator | Every week, find trending topics and draft 3 blog briefs | Telegram with 3 titled briefs | web_search, telegram_send | No (generation is AI) |
| 42 | Podcast discovery agent | Find new AI podcasts published this week | Telegram list with show + episode | web_search, telegram_send | Partially |
| 43 | Academic paper summariser | Daily: summarise 3 most relevant new papers | Telegram summaries | web_search, telegram_send | No (summarisation is AI) |
| 44 | Newsletter curator | Every Friday, 5 best links shared in AI circles this week | Telegram reading list | web_search, telegram_send | Yes (manually curated) |
| 45 | SEO rank tracker | Weekly: where does my site rank for my top 5 keywords | Telegram rank report | web_search, telegram_send | Yes (SEMrush) |
| 46 | Backlink monitor | Alert when a new site links to my domain | Telegram alert with linking domain | web_search, telegram_send | Yes (Ahrefs alerts) |
| 47 | Case study lead finder | Find companies publicly talking about switching from Zapier | Telegram list of prospects | web_search, telegram_send | No (discovery + reasoning is AI) |
| 48 | Thought leader tracker | Daily: new posts from Karpathy, Altman, LeCun | Telegram digest | web_search, telegram_send | Yes (RSS/Twitter lists) |
| 49 | Event/conference monitor | Alert when new AI conferences open registration | Telegram with event + date | web_search, telegram_send | Partially |
| 50 | Grant/funding opportunity finder | Weekly: new AI research grants accepting applications | Telegram with grant + deadline | web_search, telegram_send | Partially |

## Sales & Growth

| # | Use Case | Intent | Output | Tools | Pre-AI possible? |
|---|---|---|---|---|---|
| 51 | Lead enrichment agent | For each new lead, research company and summarise fit | Telegram or API with enriched profile | web_search, http_request, telegram_send | No (research synthesis is AI) |
| 52 | Competitor customer poaching monitor | Alert when competitor announces price increase or downtime | Telegram opportunity alert | web_search, telegram_send | Partially |
| 53 | Outbound timing agent | Alert when target account posts job that signals product need | Telegram alert with company + job title | web_search, telegram_send | No (signal interpretation is AI) |
| 54 | Demo request follow-up reminder | Alert if demo request hasn't been responded to in 2 hours | Telegram with contact name | http_request, telegram_send | Yes (CRM automation) |
| 55 | Win/loss reason tracker | Weekly: analyse closed/lost deals and surface top objection patterns | Telegram structured summary | http_request, web_search, telegram_send | No (pattern analysis is AI) |
| 56 | Product-led growth signal | Alert when free user invites 3+ teammates | Telegram alert | http_request, telegram_send | Yes (analytics webhooks) |
| 57 | Account health scorer | Daily: flag accounts with declining usage trend | Telegram risk list | http_request, telegram_send | Partially (ML models exist) |
| 58 | Referral program monitor | Alert when a referral code is used | Telegram instant alert | http_request, telegram_send | Yes (webhooks) |
| 59 | App store review tracker | Alert when app gets a new review under 3 stars | Telegram with review text | http_request, web_search, telegram_send | Yes (Appfigures) |
| 60 | GTM launch monitor | Alert when a competitor launches on Product Hunt | Telegram alert with launch details | web_search, telegram_send | Yes (PH notifications) |

## Finance & Crypto

| # | Use Case | Intent | Output | Tools | Pre-AI possible? |
|---|---|---|---|---|---|
| 61 | Crypto price alert | Alert when BTC drops below $60k or rises above $80k | Telegram price alert | http_request, telegram_send | Yes (price alert apps) |
| 62 | Portfolio daily P&L | Every morning, fetch portfolio value and brief me | Telegram P&L summary | http_request, telegram_send | Yes (portfolio apps) |
| 63 | DeFi protocol news monitor | Alert about major exploits or rug pulls in DeFi protocols | Telegram security alert | web_search, telegram_send | Partially |
| 64 | Earnings call summariser | Day after earnings call, brief me on key numbers | Telegram earnings summary | web_search, telegram_send | No (summarisation is AI) |
| 65 | Macro indicator tracker | Weekly: CPI, unemployment, Fed rate decisions briefing | Telegram macro brief | web_search, http_request, telegram_send | Partially |
| 66 | Stock news alert | Alert when any news about my watchlist breaks | Telegram with headline | web_search, telegram_send | Yes (Google Finance alerts) |
| 67 | NFT floor price tracker | Alert when collection floor drops below X ETH | Telegram alert | http_request, telegram_send | Yes (NFT tools) |
| 68 | Budget burn rate alert | Alert when AWS spend exceeds daily budget | Telegram with current spend | http_request, telegram_send | Yes (AWS Budgets) |

## Personal Productivity

| # | Use Case | Intent | Output | Tools | Pre-AI possible? |
|---|---|---|---|---|---|
| 69 | Daily agenda brief | Every morning: weather + top HN + GitHub notifications | Telegram morning brief | web_search, github_api, http_request, telegram_send | Partially |
| 70 | Reading list curator | Every Sunday, compile saved articles into weekly digest | Telegram reading list | web_search, telegram_send | Yes (Pocket) |
| 71 | Habit tracker reminder | Every evening at 9pm, remind me to log habits | Telegram reminder | telegram_send | Yes (any reminder app) |
| 72 | Learning goal tracker | Every week, find 1 paper/article for my ML learning goal | Telegram curated pick | web_search, telegram_send | No (relevance judgment is AI) |
| 73 | Flight price monitor | Alert when LAX→LHR price drops below $600 | Telegram price alert | web_search, http_request, telegram_send | Yes (Google Flights alerts) |
| 74 | Meeting prep agent | 30 mins before meeting, research people I'm meeting | Telegram meeting brief | web_search, telegram_send | No (synthesis is AI) |
| 75 | Task overdue reminder | Every morning, alert about tasks past due in Linear | Telegram overdue task list | http_request, telegram_send | Yes (Linear reminders) |

## Infrastructure & Cloud

| # | Use Case | Intent | Output | Tools | Pre-AI possible? |
|---|---|---|---|---|---|
| 76 | AWS cost anomaly detector | Alert if any service bill spikes > 20% vs last week | Telegram alert with service + delta | http_request, telegram_send | Yes (AWS Cost Anomaly) |
| 77 | Kubernetes pod crash monitor | Alert when any pod restarts > 3 times in an hour | Telegram alert with pod name | http_request, telegram_send | Yes (Prometheus alerts) |
| 78 | Database slow query monitor | Alert daily about queries taking > 1s on average | Telegram report with query excerpts | http_request, telegram_send | Yes (pg_stat / Datadog) |
| 79 | Log error spike detector | Alert when error rate exceeds 1% in 5-min window | Telegram alert with error count | http_request, telegram_send | Yes (Datadog/PagerDuty) |
| 80 | Disk space monitor | Alert when any server disk exceeds 85% usage | Telegram with server + usage % | http_request, telegram_send | Yes (monitoring tools) |
| 81 | CDN performance report | Weekly: p95 latency by region for our CDN | Telegram latency table | http_request, telegram_send | Yes (CDN dashboards) |
| 82 | Scheduled DB backup verifier | Daily: verify last night's DB backup completed | Telegram confirm or alert | http_request, telegram_send | Yes (backup scripts) |

## Multi-agent Workflows

| # | Use Case | Intent | Output | Tools | Pre-AI possible? |
|---|---|---|---|---|---|
| 83 | Full competitor intel pipeline | Weekly: scrape 5 competitors, rank by threat level, brief me | Telegram ranked threat brief | web_search, telegram_send | No (ranking + synthesis is AI) |
| 84 | PR review pipeline | For every PR: check tests, secrets, style, post summary | GitHub PR comment + Telegram | github_api, web_search, telegram_send | Partially (separate tools, not unified) |
| 85 | Lead research pipeline | For each new signup, research company, score 1-10, add to CRM | CRM updated + Telegram | http_request, web_search, telegram_send | No (scoring + synthesis is AI) |
| 86 | Incident response pipeline | On alert: diagnose, find similar past incidents, draft postmortem | Telegram postmortem draft | http_request, web_search, telegram_send | No (reasoning + drafting is AI) |
| 87 | Content repurposing pipeline | Take each blog post, create Twitter thread + LinkedIn post + email | 3 outputs on Telegram | http_request, web_search, telegram_send | No (generation is AI) |
| 88 | Candidate research pipeline | For each applicant, research GitHub + blog, summarise fit | Telegram candidate brief | github_api, web_search, telegram_send | No (synthesis is AI) |
| 89 | Customer onboarding monitor | For new signups: check setup completion, nudge if stalled | Telegram alert or trigger | http_request, telegram_send | Partially (Intercom sequences) |
| 90 | Security audit pipeline | Weekly: scan for secrets, check vulns, full report | Telegram security report | github_api, web_search, telegram_send | Partially (Snyk + manual review) |

## Skill Library Unlocks

| # | Use Case | What Skill Enables | Without Skill | With Skill |
|---|---|---|---|---|
| 91 | Re-use proven HN scraper node | Builder loads tested node instead of writing new prompt | Sometimes hallucinates wrong API | Works on first run |
| 92 | Plug in battle-tested Telegram reporter | Correct MarkdownV2 handling built in | Formatting errors on first run | Zero errors |
| 93 | GitHub PR scanner node | Knows exactly which API endpoints to call | Trial and error | Works first time |
| 94 | Competitor monitor node | Optimised search queries pre-baked | Generic queries, poor results | Better signal |
| 95 | Web scraper node | Handles pagination, rate limits, retries | Brittle on first run | Reliable |
| 96 | Save user's custom node as skill | User saves a working node for reuse | Lost when workflow deleted | Reusable forever |

## Memory Unlocks

| # | Use Case | What Memory Enables | Without Memory | With Memory |
|---|---|---|---|---|
| 97 | Second HN workflow builds better | Builder sees first HN workflow succeeded | Starts from scratch every time | Copies proven structure |
| 98 | Builder avoids past failure patterns | Repair notes feed back to Builder | Same mistakes repeated | Pre-empted |
| 99 | Intent autocomplete | Canvas shows 3 similar past workflows | Blank canvas | Clone a working workflow |
| 100 | Cross-user pattern sharing | Patterns from all users improve builds | Only your history | Collective intelligence |
| 101 | Repair memory | Fix stored → Builder pre-applies it | Repair happens at runtime | Prevented at build time |

## Versioning Unlocks

| # | Use Case | What Versioning Enables | Without Versioning | With Versioning |
|---|---|---|---|---|
| 102 | Rollback after bad edit | User changed prompt, broke workflow → rollback | Workflow lost, rebuild from scratch | One-click restore |
| 103 | Compare before/after repair | See exactly what repair agent changed | Black box changes | Full diff view |
| 104 | A/B test two node prompts | Deploy v1, compare results vs v2 | No way to compare | Data-driven |
| 105 | Compliance audit trail | Show every change, who made it, when | No audit history | Enterprise-ready |
| 106 | Gradual rollout | Deploy new version to 10% of runs, watch, then 100% | All-or-nothing deploy | Safe progressive rollout |

---
*Last updated: 2026-05-29*
*Total: 106 use cases across 10 categories*
