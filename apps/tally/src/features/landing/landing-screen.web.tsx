import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "expo-router";
import Head from "expo-router/head";
import { useSession } from "../auth/session-provider";
import { useTheme } from "../../shared/theme";
import { AppearanceControl } from "../../shared/appearance-control";
import { Icon, type IconName } from "../../shared/icons";
import { HeroPreview, RepaymentDemo } from "./landing-demo.web";
import "./landing.css";

function Logo() {
  return (
    <a href="/" className="tally-landing-logo" aria-label="Tally homepage">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="10" fill="currentColor" />
        <path
          d="M10 7v18M16 7v18M22 7v18M6 22 26 11"
          fill="none"
          stroke="var(--landing-bg)"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
      tally<span>.</span>
    </a>
  );
}
const features: {
  title: string;
  description: string;
  icon: IconName;
  tone: string;
}[] = [
  {
    title: "Both sides of the story.",
    description:
      "Money you borrowed and money you lent. Keep the people, dates, and remaining amounts together.",
    icon: "people",
    tone: "blue",
  },
  {
    title: "Bills find their rhythm.",
    description:
      "Rent, internet, installments, and subscriptions. Each recurring period keeps its own amount and history.",
    icon: "calendar",
    tone: "green",
  },
  {
    title: "Automatic, with clarity.",
    description:
      "See expected deductions and confirm they happened. Track a failed deduction without losing the outstanding bill.",
    icon: "bolt",
    tone: "amber",
  },
  {
    title: "A nudge at the right time.",
    description:
      "Keep upcoming, due-today, and overdue obligations in view. Configure reminders around your due dates.",
    icon: "bell",
    tone: "green",
  },
];
const questions = [
  [
    "What can I track in Tally?",
    "Money you owe, money owed to you, loans, partial repayments, installments, and recurring bills. Tally keeps the focus on what’s due and what remains.",
  ],
  [
    "Does Tally connect to my bank?",
    "No direct bank connection is required. Payment sources such as Cash, GCash, or a credit card are labels that help you organise your records.",
  ],
  [
    "Does automatic mean Tally moves my money?",
    "No. Tally tracks expected automatic deductions. Choose confirmation if you want to verify that a payment actually happened.",
  ],
  [
    "Can I keep different currencies?",
    "Yes. Each obligation keeps its own currency, and totals remain separated by currency. Tally doesn’t assume an exchange rate.",
  ],
  [
    "Can I open it on my phone?",
    "Yes. Tally’s web app adapts to phones, tablets, and desktop browsers. Sign in to access your workspace.",
  ],
];
export function LandingScreen() {
  const theme = useTheme(),
    { session } = useSession();
  const [motionPaused, setMotionPaused] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const targets = element.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12 },
    );
    targets.forEach((target) => {
      target.classList.add("can-reveal");
      observer.observe(target);
    });
    return () => {
      observer.disconnect();
      targets.forEach((target) => target.classList.remove("can-reveal"));
    };
  }, []);
  const variables = {
    "--landing-bg": theme.background,
    "--landing-surface": theme.surface,
    "--landing-ink": theme.ink,
    "--landing-muted": theme.muted,
    "--landing-primary": theme.primary,
    "--landing-border": theme.border,
    "--landing-tint": theme.tint,
    "--landing-green": theme.greenBg,
    "--landing-blue": theme.blueBg,
    "--landing-amber": theme.amberBg,
  } as CSSProperties;
  const destination = session ? "/home" : "/sign-up";
  return (
    <div
      ref={root}
      className={`tally-landing ${theme.isDark ? "tally-landing-dark" : ""} ${motionPaused ? "tally-motion-paused" : ""}`}
      style={variables}
    >
      <Head>
        <title>Tally — Know what’s due.</title>
        <meta
          name="description"
          content="A little clarity for money you owe, money owed to you, and recurring bills. Tally helps you know what’s due, what’s paid, and what remains."
        />
      </Head>
      <a className="tally-skip" href="#tally-main">
        Skip to content
      </a>
      <header className="tally-landing-nav">
        <div className="tally-container tally-nav-inner">
          <Logo />
          <nav aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#why-tally">Why Tally</a>
            <a href="#questions">Questions</a>
          </nav>
          <div className="tally-nav-actions">
            <AppearanceControl />
            <Link href="/sign-in" asChild>
              <a className="tally-sign-in">Sign in</a>
            </Link>
            <Link href={destination} asChild>
              <a className="tally-cta tally-nav-cta">
                {session ? "Open workspace" : "Get started"}
                <span aria-hidden="true">↗</span>
              </a>
            </Link>
          </div>
        </div>
      </header>
      <main id="tally-main">
        <section className="tally-container tally-hero">
          <div className="tally-hero-copy">
            <span className="tally-eyebrow tally-hero-enter">
              <span className="tally-tiny-dot" />
              LESS MENTAL MATH. MORE PEACE OF MIND.
            </span>
            <h1 className="tally-hero-enter">
              Know what’s due.
              <br />
              <em>Enjoy what’s next.</em>
            </h1>
            <p className="tally-hero-enter">
              Loans, little IOUs, monthly bills. Put them in one calm place, and
              make room for everything else.
            </p>
            <div className="tally-hero-buttons tally-hero-enter">
              <Link href={destination} asChild>
                <a className="tally-cta">
                  {session ? "Open your workspace" : "Find your clarity"}
                  <Icon name="arrow" color={theme.background} size={19} />
                </a>
              </Link>
              <a className="tally-text-link" href="#how-it-works">
                See how it feels <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div className="tally-hero-trust tally-hero-enter">
              <Icon name="shield" color={theme.primary} size={15} />
              <span>Your records. Your space. No bank credentials.</span>
              <button
                className="tally-motion-button"
                aria-pressed={motionPaused}
                onClick={() => setMotionPaused((value) => !value)}
              >
                {motionPaused ? "Play motion" : "Pause motion"}
              </button>
            </div>
          </div>
          <HeroPreview />
        </section>
        <div className="tally-feature-ribbon" aria-label="What Tally tracks">
          <div className="tally-container">
            <span>Borrowed money</span>
            <i />
            <span>Money lent</span>
            <i />
            <span>Monthly dues</span>
            <i />
            <span>Partial payments</span>
            <i />
            <span>Auto deductions</span>
          </div>
        </div>
        <section
          id="why-tally"
          className="tally-container tally-clarity"
          data-reveal
        >
          <span className="tally-eyebrow">
            FOR THE THINGS LIFE ASKS YOU TO REMEMBER
          </span>
          <h2>
            You shouldn’t need a better memory.
            <br />
            You need <span>a clearer view.</span>
          </h2>
          <div className="tally-clarity-notes">
            <div>
              <span className="tally-note-number">01</span>
              <p>“Did I already pay that?”</p>
              <small>Every payment, saved in its own history.</small>
            </div>
            <div>
              <span className="tally-note-number">02</span>
              <p>“How much is still left?”</p>
              <small>A remaining balance that follows your repayments.</small>
            </div>
            <div>
              <span className="tally-note-number">03</span>
              <p>“What’s coming next?”</p>
              <small>
                Due dates and deductions, together in your calendar.
              </small>
            </div>
          </div>
        </section>
        <section
          id="how-it-works"
          className="tally-container tally-repayment-story"
        >
          <div data-reveal>
            <span className="tally-eyebrow">
              SMALL PAYMENTS. REAL PROGRESS.
            </span>
            <h2>
              Every little bit
              <br />
              <em>counts.</em>
            </h2>
            <p>
              A loan rarely disappears all at once. Record a partial repayment
              and watch the remaining balance become clearer.
            </p>
            <div className="tally-story-note">
              <Icon name="check" color={theme.primary} size={18} />
              <span>
                The original amount stays. Every repayment gets its own record.
              </span>
            </div>
            <p className="tally-try-hint">
              Go on. Try the repayment button. <span aria-hidden="true">↗</span>
            </p>
          </div>
          <div data-reveal>
            <RepaymentDemo />
          </div>
        </section>
        <section className="tally-container tally-features">
          <div className="tally-section-heading" data-reveal>
            <span className="tally-eyebrow">A PLACE FOR THE WHOLE PICTURE</span>
            <h2>
              Made for real life.
              <br />
              And all its due dates.
            </h2>
            <p>
              Simple enough for a small loan. Thoughtful enough for the bills
              that come around every month.
            </p>
          </div>
          <div className="tally-features-grid">
            {features.map((feature, i) => (
              <article
                key={feature.title}
                className={`tally-feature-card tally-feature-${feature.tone}`}
                data-reveal
                style={
                  { "--reveal-delay": `${(i % 2) * 90}ms` } as CSSProperties
                }
              >
                <span className="tally-feature-icon">
                  <Icon name={feature.icon} color={theme.primary} size={27} />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <span className="tally-feature-index" aria-hidden="true">
                  0{i + 1}
                </span>
              </article>
            ))}
          </div>
        </section>
        <section className="tally-container tally-rhythm-story" data-reveal>
          <div className="tally-rhythm-copy">
            <span className="tally-eyebrow">
              THE SAME BILL. A FRESH CHAPTER.
            </span>
            <h2>
              Your bills repeat.
              <br />
              <em>Their history stays.</em>
            </h2>
            <p>
              Each billing period gets its own record. Fixed subscriptions,
              variable electricity bills, automatic deductions. See what
              happened, and what happens next.
            </p>
          </div>
          <div
            className="tally-periods"
            aria-label="Illustrative monthly electricity bills"
          >
            <div>
              <small>SEPTEMBER</small>
              <strong>₱3,250</strong>
              <span className="tally-period-paid">✓ Paid</span>
            </div>
            <div>
              <small>OCTOBER</small>
              <strong>₱3,810</strong>
              <span className="tally-period-paid">✓ Paid</span>
            </div>
            <div>
              <small>NOVEMBER</small>
              <strong>₱3,460</strong>
              <span className="tally-period-due">◷ Pending</span>
            </div>
            <p>Sample variable bill · separate periods, separate amounts.</p>
          </div>
        </section>
        <section className="tally-container tally-private" data-reveal>
          <div className="tally-private-mark" aria-hidden="true">
            <Icon name="shield" color={theme.primary} size={40} />
          </div>
          <div>
            <span className="tally-eyebrow">PERSONAL MEANS PERSONAL</span>
            <h2>
              A calmer space.
              <br />A private one, too.
            </h2>
            <p>
              Your financial records belong to your account. Payment sources are
              labels, so there’s no need to share card credentials or banking
              passwords.
            </p>
          </div>
          <div className="tally-private-details">
            <span>
              <Icon name="check" color={theme.primary} size={17} />
              Your own workspace
            </span>
            <span>
              <Icon name="check" color={theme.primary} size={17} />
              Currencies kept separate
            </span>
            <span>
              <Icon name="check" color={theme.primary} size={17} />
              Light, dark, or your system
            </span>
          </div>
        </section>
        <section id="questions" className="tally-container tally-faq">
          <div data-reveal>
            <span className="tally-eyebrow">A FEW GOOD QUESTIONS</span>
            <h2>A little more clarity.</h2>
          </div>
          <div data-reveal>
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="tally-container tally-final" data-reveal>
          <span className="tally-eyebrow">ONE LESS THING ON YOUR MIND</span>
          <h2>
            Your next chapter
            <br />
            starts with <em>clarity.</em>
          </h2>
          <p>
            Put your first obligation in Tally. Take the rest of your day back.
          </p>
          <Link href={destination} asChild>
            <a className="tally-cta">
              {session ? "Go to your workspace" : "Get started with Tally"}
              <Icon name="arrow" color={theme.background} size={19} />
            </a>
          </Link>
          <span className="tally-final-tallies" aria-hidden="true">
            ⅠⅠⅠ╱
          </span>
        </section>
      </main>
      <footer className="tally-container tally-landing-footer">
        <div>
          <Logo />
          <p>Know what’s due.</p>
        </div>
        <div>
          <a href="#how-it-works">How it works</a>
          <Link href="/sign-in" asChild>
            <a>Sign in</a>
          </Link>
          <Link href={destination} asChild>
            <a>{session ? "Workspace" : "Create account"}</a>
          </Link>
        </div>
        <p>© {new Date().getFullYear()} Tally · Code Box Studios</p>
      </footer>
    </div>
  );
}
