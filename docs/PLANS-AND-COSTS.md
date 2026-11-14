# Plans and costs: free or paid, your choice

ProjectHub runs on outside services. Each has a free option and paid options. You can start free and
upgrade any time; nothing in ProjectHub changes when you do (only Supabase's pausing goes away, or
you move hosting).

> Prices below were checked in **November 2026** and are in US dollars. They change, so check
> each provider's own pricing page (linked) before deciding. Taxes may apply.

## At a glance

| Service | What ProjectHub uses it for | Free option | Paid option |
|---|---|---|---|
| [Supabase](https://supabase.com/pricing) | Database, sign-in, file storage | **Free**: 2 projects, 500 MB database, 50,000 monthly users; pauses after a week without use | **Pro**: from $25/month per organisation (includes $10 of compute), no pausing, daily backups |
| [Vercel](https://vercel.com/pricing) | Hosting (option A) | **Hobby**: free, **personal and non-commercial only** | **Pro**: $20/month per deploying seat, includes $20 of usage |
| Your own server | Hosting (options B and C: Docker / Kubernetes) | A machine you already have | Any cloud VM or cluster; price depends on the provider |
| Gmail | Email (option 1) | Free with an app password | n/a |
| [Resend](https://resend.com/pricing) | Email (option 2) | 3,000 emails/month (100 a day) | Pro from $20/month (50,000 emails) |
| [Recall.ai](https://www.recall.ai/pricing) | Meeting recorder bot | First 5 hours free | $0.50 per meeting hour, plus $0.15/hour for its transcription |
| [Claude API](https://platform.claude.com/docs/en/about-claude/pricing) | Meeting summaries | n/a | Pay per use: about a few cents per meeting hour; set a monthly limit |
| A domain name (optional) | Your own address, e.g. `projecthub.yourcompany.com` | Use the free `*.vercel.app` address | Yearly, from any domain registrar |

## Example setups

| Setup | Good for | Roughly per month |
|---|---|---|
| **All free**: Supabase Free + Vercel Hobby + Gmail | Trying it, personal use | **$0** (but the database pauses after a week of no use, and Vercel Hobby can't be used commercially) |
| **Small business**: Supabase Pro + Vercel Pro + Gmail or Resend free | A company or client using it every day | **About $45** + any usage over the included amounts |
| **Self-hosted**: Supabase Pro + your own server with Docker | Keeping hosting on your own infrastructure | **$25** + your server's cost |
| **+ Meeting recorder** | Recording meetings | Add about **$0.65 per meeting hour** (Recall.ai) plus a few cents per meeting (Claude) |

## Things to know when choosing

- **Supabase Free pauses** a project after a week without activity. The site stops working until
  someone clicks **Restore** in the Supabase dashboard (data is kept). It also has **no downloadable
  backups**. Pro removes the pause and adds daily backups.
- **Vercel Hobby is for personal, non-commercial use.** Business use needs Pro, or host it yourself
  with Docker.
- **Recall.ai pay as you go** has a monthly cap (500 hours) and a 2-hour limit per recording; bigger
  plans are available from Recall.
- **Claude Pro/Max chat subscriptions don't cover the API.** The meeting recorder's summaries use an
  API key billed separately. (The Claude connector is different: each person uses their own Claude
  plan, at no cost to ProjectHub.)
- **Where data lives:** choose Supabase and Recall.ai regions that suit your data-protection rules
  (e.g. EU regions for European data). Vercel's region is set in `vercel.json`.
