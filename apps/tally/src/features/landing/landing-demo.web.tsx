import React, { useState } from "react";
import { Icon } from "../../shared/icons";
import { useTheme } from "../../shared/theme";

export function RepaymentDemo() {
  const [payments, setPayments] = useState(0);
  const theme = useTheme();
  const paid = payments * 5000;
  const format = (value: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(value);
  return (
    <div className="tally-payment-demo">
      <div className="tally-demo-heading">
        <span className="tally-demo-avatar">A</span>
        <div>
          <strong>Loan to Alex</strong>
          <small>Owed to you · sample obligation</small>
        </div>
        <span className="tally-demo-status">
          {payments === 4 ? "Paid" : payments ? "Partially paid" : "Active"}
        </span>
      </div>
      <div className="tally-demo-balance" aria-live="polite">
        <span>Still remaining</span>
        <strong key={payments}>{format(20000 - paid)}</strong>
      </div>
      <div
        className="tally-demo-progress"
        role="progressbar"
        aria-label="Sample loan repayment"
        aria-valuemin={0}
        aria-valuemax={20000}
        aria-valuenow={paid}
      >
        <div style={{ width: `${payments * 25}%` }} />
      </div>
      <div className="tally-demo-totals">
        <div>
          <small>Original amount</small>
          <strong>₱20,000</strong>
        </div>
        <div>
          <small>Repaid so far</small>
          <strong>{format(paid)}</strong>
        </div>
      </div>
      <div className="tally-demo-history">
        {payments === 0 ? (
          <p>Every payment gets its own place in the story.</p>
        ) : (
          Array.from({ length: payments }, (_, i) => (
            <div className="tally-demo-payment" key={i}>
              <Icon name="check" color={theme.primary} size={15} />
              <span>Payment {i + 1}</span>
              <strong>₱5,000</strong>
            </div>
          ))
        )}
      </div>
      <button
        className="tally-cta"
        onClick={() => setPayments((count) => (count === 4 ? 0 : count + 1))}
      >
        {payments === 4 ? "Try it again" : "Try a ₱5,000 repayment"}
        <Icon
          name={payments === 4 ? "arrow" : "plus"}
          color={theme.background}
          size={17}
        />
      </button>
      <p className="tally-demo-caption">
        Interactive example. No real payments or records are created.
      </p>
    </div>
  );
}

export function HeroPreview() {
  const theme = useTheme();
  return (
    <div
      className="tally-hero-stage"
      aria-label="Illustrative Tally dashboard preview"
    >
      <div className="tally-orbit-field" aria-hidden="true">
        <div className="tally-orbit tally-orbit-outer" aria-hidden="true" />
        <div className="tally-orbit tally-orbit-inner" aria-hidden="true" />
        <div className="tally-orbit-dot" aria-hidden="true" />
      </div>
      <div className="tally-floating-note tally-note-owe">
        <span className="tally-preview-icon">
          <Icon name="arrowUp" color={theme.green} />
        </span>
        <small>You owe</small>
        <strong>₱20,000</strong>
        <span>One clear view.</span>
      </div>
      <div className="tally-floating-note tally-note-owed">
        <span className="tally-preview-icon">
          <Icon name="arrowDown" color={theme.blue} />
        </span>
        <small>Owed to you</small>
        <strong>₱7,500</strong>
        <span>Every little bit counts.</span>
      </div>
      <div className="tally-week-preview">
        <div className="tally-week-top">
          <div>
            <span className="tally-eyebrow">YOUR WEEK, IN VIEW</span>
            <h3>A little room to breathe.</h3>
          </div>
          <Icon name="calendar" color={theme.primary} size={23} />
        </div>
        <div className="tally-week-row">
          <span className="tally-week-day">
            THU<b>15</b>
          </span>
          <span>
            <strong>Internet</strong>
            <small>Monthly due</small>
          </span>
          <b>₱1,699</b>
        </div>
        <div className="tally-week-row">
          <span className="tally-week-day tally-blue">
            FRI<b>16</b>
          </span>
          <span>
            <strong>Alex’s repayment</strong>
            <small>Owed to you</small>
          </span>
          <b>₱1,000</b>
        </div>
        <div className="tally-week-row">
          <span className="tally-week-day tally-amber">
            SUN<b>18</b>
          </span>
          <span>
            <strong>Netflix</strong>
            <small>
              <Icon name="bolt" color={theme.amber} size={12} /> Auto deduct
            </small>
          </span>
          <b>₱549</b>
        </div>
        <div className="tally-week-footer">
          <span className="tally-tiny-dot" />
          Nothing forgotten. Everything in view.
        </div>
      </div>
      <div className="tally-paid-note">
        <span>
          <Icon name="check" color={theme.green} size={17} />
        </span>
        <div>
          <strong>Payment recorded.</strong>
          <small>One less thing on your mind.</small>
        </div>
      </div>
      <span className="tally-preview-caption">
        Illustrative product preview
      </span>
    </div>
  );
}
