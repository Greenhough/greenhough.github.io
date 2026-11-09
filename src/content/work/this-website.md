---
title: "This Website"
slug: "this-website"
eyebrow: "Vibe Coding"
tags: ["Claude"]
date: 2026-07-03
description: "How I built this site with Claude Design and Claude Code, and learned GitHub along the way."
summary: "The site you're reading. Created with Claude Design/Claude Code and shipped on GitHub Pages to learn git."
dek: "I mocked up this website with Claude Design, built it with Claude Code, and shipped it on GitHub Pages."
theme: "Built for Myself"
cover: "../../assets/covers/this-website.png"
---
<figure class="cs-fig">
  <img src="/assets/coming-soon.png" alt="The original placeholder page: plain black text reading 'Coming soon. Design in progress.' on a white background" width="1800" height="570">
  <figcaption>The site on day one.</figcaption>
</figure>

<section class="cs-sec">
  <h2 class="cs-title"><span class="num">01</span>Why I built it</h2>
  <p>I wanted a spot to think out loud and showcase what I'm building. I've never really been into posting content on LinkedIn, so creating my own website felt like a good compromise.</p>
  <p>The other reason I took on this project was to get hands-on experience with GitHub. Repo and commit meant nothing to me. I wanted to learn some of the basics and git good. Hah.</p>
</section>

<section class="cs-sec">
  <h2 class="cs-title"><span class="num">02</span>What I built</h2>
  <p>The website you're looking at right now. Pretty neat, eh? At the time of this post, it includes a home page, a spot for projects and case studies, as well as a blog for my writing. There's also a proper 404 page, although I hope you don't find it lol.</p>
  <p>I used Claude Design to create the initial visual identity for the website. I'm obsessed with how Clay rebranded their home page and started with their website as inspiration. I really liked the personality of the initial direction, but it didn't feel like me. I workshopped a few different ideas and ended up with the brand I have today.</p>
</section>

<figure class="cs-fig">
  <img src="/assets/brand-identities.jpg" alt="Three brand identity concepts from Claude Design, each with different type, color, and layout" width="1800" height="784">
  <figcaption>Early brand directions from Claude Design.</figcaption>
</figure>

<section class="cs-sec">
  <p>A few things I like are:</p>
  <ul>
    <li>The green color (it's in my last name)</li>
    <li>The brutalist font and overall feel</li>
    <li>That slick-looking typewriter animation</li>
    <li>The asterisk logo (a small nod to my favourite author, Kurt Vonnegut)</li>
  </ul>
</section>

<figure class="cs-fig">
  <img src="/assets/hero-image-variations.jpg" alt="Four hero layout options from Claude Design, each framing the portrait a different way" width="1800" height="1125">
  <figcaption>Workshopping hero layouts once the portrait joined.</figcaption>
</figure>

<section class="cs-sec">
  <p>Once I locked in the design, I went to Claude Code to figure out how to get the design out of Claude Design and into a format GitHub could serve.</p>
</section>

<section class="cs-sec">
  <h2 class="cs-title"><span class="num">03</span>How it works</h2>
  <p>I used GitHub Pages to host the code. It serves whatever is on the main branch, so pushing a commit deploys the content live on my site. The upside of using GitHub for my website:</p>
  <ul>
    <li><strong>Version history.</strong> Git keeps every version of every file. The screenshot of the day-one placeholder page in this post exists because I pulled it back out of the repo's history.</li>
    <li><strong>Branching.</strong> I can experiment with design changes on a separate branch without touching the live site.</li>
    <li><strong>Free hosting.</strong> GitHub Pages costs nothing. The domain is the only bill.</li>
    <li><strong>I own the files.</strong> The whole site is plain HTML and CSS in a folder. No platform lock-in, nothing to migrate off of later.</li>
  </ul>
  <p>The tradeoff is that, unlike a proper CMS like WordPress or Squarespace, there's a lot of manual updating that needs to be done when I add new content. The content needs to be uploaded, the home page updated, the descriptions written, and a handful of other dependencies fixed.</p>
  <p>To combat this, I made a few different skills in Claude Code that automate the entire process. With a single slash command, Claude Code pulls the latest version of the site, builds the new page, adds it to the right hub and the home page, writes the titles and metadata in the standard format, pushes the commit, and confirms the live page works. The repo also carries a playbook documenting every step, so nothing gets overlooked. This write-up was published through that exact flow.</p>
</section>

<section class="cs-sec">
  <h2 class="cs-title"><span class="num">04</span>What broke &amp; what I learned</h2>
  <p>Bugs, bears, Battlestar Galactica. Speaking of bugs, the first one I encountered was with the navigation bar. I wanted it to float down with you as you scrolled down the page. However, if you scrolled down slightly and stopped in the right place, the bar rapidly jackhammered up and down. The bar shrinks when you scroll, shrinking changes the page height, and that change pushed the scroll position back across the threshold that triggered the shrink. An infinite loop. Claude helped me debug the problem by creating two thresholds: one to shrink after scrolling far enough down, and another to expand only after coming most of the way back up.</p>
  <p>One of the other challenges I ran into came from running multiple Claude Code sessions at once. Each session works from its own local copy of the repo, and that copy only updates when you pull the latest version from GitHub. This resulted in some sessions working with an outdated copy, which caused an issue at one point and taught me why it's important to pull the latest version before editing anything.</p>
  <p>I've had the idea of building my own website flicker up from time to time over the years. Yet I'd never actually built a version that I was happy with. Claude Design and Claude Code helped me change that. I was able to go from idea to a live domain in less than a day. I've also learned a bunch about GitHub and have an automated publishing process I can rely on.</p>
</section>
