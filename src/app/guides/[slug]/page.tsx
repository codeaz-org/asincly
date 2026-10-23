import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseAttribution } from "@/lib/attribution";
import { getGuide } from "@/lib/guides";
import { recordVisit } from "@/lib/visits";

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const guide = await getGuide((await params).slug);
  if (!guide) return {};
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: { title: guide.title, description: guide.description, type: "article", publishedTime: guide.date },
  };
}

export default async function GuidePage({ params, searchParams }: PageProps<"/guides/[slug]">) {
  const guide = await getGuide((await params).slug);
  if (!guide) notFound();
  const attribution = parseAttribution(await searchParams);
  const userAgent = (await headers()).get("user-agent");
  after(() => recordVisit(`/guides/${guide.slug}`, attribution, userAgent));
  return (
    <article className="guide space-y-6">
      <header className="space-y-3">
        <p className="kicker">
          <time dateTime={guide.date}>{guide.date}</time>
        </p>
        <h1 className="display text-4xl sm:text-5xl text-ink">{guide.title}</h1>
        <p className="text-soft">{guide.description}</p>
      </header>
      {/* Our own content, but still no raw HTML: react-markdown sanitizes by default. */}
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{guide.body}</ReactMarkdown>
    </article>
  );
}
