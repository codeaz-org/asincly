// Calls Asincly's 5-minute tick (reminders, digests). Vercel Hobby only allows
// daily crons; Cloudflare Workers' cron triggers are free and run on time.
const worker = {
  async scheduled(_event, env) {
    const res = await fetch(`${env.APP_URL}/api/cron/tick`, {
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
    // Throwing marks the run as failed in the Worker's logs.
    if (!res.ok) throw new Error(`tick returned ${res.status}`);
  },
};

export default worker;
