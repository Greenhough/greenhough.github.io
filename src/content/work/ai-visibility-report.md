---
title: "AI Visibility Report"
slug: "ai-visibility-report"
eyebrow: "Build"
tags: ["Claude Code", "Python"]
date: 2026-07-21
description: "How I built an AI citation tracker on top of Peekaboo to see how WBM shows up in AI answers, measure discovery visibility, and find where we're missing."
summary: "An off-the-shelf AI visibility report, reworked into a tool a team can review every two weeks and act on."
dek: "An AI citation tracker I built on top of Peekaboo to see how WBM shows up in AI answers, and where we don't."
theme: "Built for Work"
---
<figure class="cs-fig">
  <img src="/assets/ai-visibility-overview.png" alt="The dashboard's Overview tab: KPI cards for AI visibility, model runs, average score, citations, sentiment and position, above a visibility-over-time line chart and a competitor-mentions chart with anonymized competitors" width="2880" height="1400">
  <figcaption>The Overview tab. Competitors and figures anonymized for this write-up.</figcaption>
</figure>

<section class="cs-sec">
  <h2 class="cs-title"><span class="num">01</span>Why I built it</h2>
  <p>With AI continuing to play a more prominent role in the buying journey, WBM has taken an interest in understanding how that journey is evolving and where we stand compared to our competitors. To help them with this question, I recently built an AI citation tracker.</p>
  <p>The data source for the dashboard comes from a tool called <a href="https://www.aipeekaboo.com/" target="_blank" rel="noopener">Peekaboo</a>. It's an AI visibility platform that lets you benchmark your visibility against your competitors. What I like about Peekaboo is that they provide prompt-level tracking based on what you set up, and record who gets mentioned and what sources are cited. It tracks citations for ChatGPT, Perplexity, Gemini, and Google's AI answers.</p>
  <p>Peekaboo has a bunch of great out-of-the-box reports, but I wanted to build something that I would have more control over.</p>
</section>

<figure class="cs-fig">
  <img src="/assets/peekaboo-sources.png" alt="A bar chart of the domains AI models cite most: reddit.com, wikipedia.org, g2.com, capterra.com, github.com, youtube.com, quora.com, forbes.com" width="2118" height="724">
  <figcaption>One of Peekaboo's built-in views: the sources AI models cite most across tracked prompts.</figcaption>
</figure>

<section class="cs-sec">
  <h2 class="cs-title"><span class="num">02</span>What I built</h2>
  <p>I built the foundation with a GitHub repo from the Peekaboo founder (<a href="https://github.com/filipelinsduarte/ai-visibility-report" target="_blank" rel="noopener">filipelinsduarte/ai-visibility-report</a>). I kept the base report it generates and made some modifications to it. These included:</p>
  <ul>
    <li>A toggle that hides branded prompts, so the visibility number reflects discovery instead of people already searching for WBM.</li>
    <li>A new Scorecard tab that tracks the KPIs we care about most, including an opportunity board that highlights the prompts we aren't visible for and a gap-sources list that shows the directories and forums getting cited when we are absent.</li>
    <li>An initiative tracker that tracks the dates we ship content or make changes, and maps it to our overall AI discoverability.</li>
  </ul>
</section>

<figure class="cs-fig">
  <img src="/assets/ai-visibility-initiative-tracker.svg" alt="A line chart of discovery visibility over time with a dated marker reading 'Jul 15, Started daily tracking'" width="900" height="300">
  <figcaption>The initiative tracker marks the day we ship something and how it influences discoverability. (Sample data.)</figcaption>
</figure>

<section class="cs-sec">
  <h2 class="cs-title"><span class="num">03</span>How it works</h2>
  <p>The report is a single dashboard that you can filter with different tabs.</p>
  <p>One of the elements I'm the most happy with is the branded toggle. It's turned on by default and hides any prompt that names us directly. This makes it so that the data reflects how visible we are for unbranded prompts instead of how often we show up when someone already knows us.</p>
  <p>The Scorecard also shows how each metric changed from the period before, so you can see what's trending up or down. Claude Code helped me work through the decisions and wrote the code.</p>
</section>

<section class="cs-sec">
  <h2 class="cs-title"><span class="num">04</span>What broke &amp; what I learned</h2>
  <p>The mistakes I made were more about the data than how I built it. When I set up our prompts, I deliberately included a batch of competitive ones, the "us versus a named competitor" comparisons, because they tell us how our brand is portrayed within our competitive set. The catch is that including any form of WBM in the prompt almost guarantees that we will be mentioned in the citations. So our share of voice and AI visibility initially looked too strong because they included data that inflated the number.</p>
  <p>One of my favorite things about building with Claude is that I get to ask it what something means, why it made a certain decision, or to explain an idea in terms that match my current understanding. For this project, I wanted to make sure I understood every data source and definition on the dashboard. Regularly asking questions helped me improve the tool tips for a few of the metrics and change a few others that I didn't have any initial context around.</p>
  <p>My main takeaway from this project is that AI enables you to look under the hood and understand what's going on if you take the time to ask.</p>
</section>
