import { LegalShell, LegalSection } from "@/components/legal/LegalShell";

export const metadata = {
  title: "AI Disclaimer — AetherForge AI",
  description:
    "Important disclaimer about AetherForge AI's AI-generated market analysis and New Zealand financial-advice law.",
};

const UPDATED = "2 July 2026";

export default function AiDisclaimer() {
  return (
    <LegalShell
      title="AI Disclaimer"
      subtitle="Please read this disclaimer carefully. It explains the nature and limitations of the AI-generated market intelligence provided by AetherForge AI and how it relates to New Zealand financial-markets law. This disclaimer forms part of our Terms & Conditions."
      updated={UPDATED}
    >
      <LegalSection heading="1. Information only — not financial advice">
        <p>
          AetherForge AI provides general market information, data and AI-generated analysis for
          educational and informational purposes only. It is{" "}
          <strong className="text-foreground/90">not licensed financial advice</strong> and does not
          take into account your particular financial situation, objectives, risk tolerance or needs.
        </p>
        <p>
          AetherForge AI is not a licensed financial advice provider under the Financial Markets Conduct
          Act 2013 (New Zealand) and does not hold a financial advice provider licence issued by the
          Financial Markets Authority (FMA). Nothing on this Service should be interpreted as a
          recommendation, opinion or guidance intended to influence you in making a decision about a
          financial product, as those terms are used in New Zealand law.
        </p>
      </LegalSection>

      <LegalSection heading="2. Seek licensed advice">
        <p>
          Before making any investment or financial decision, you should seek advice from a licensed
          financial adviser who can consider your personal circumstances. You may also wish to consult a
          licensed tax adviser or accountant. You can check whether a person or firm is licensed on the
          FMA website at{" "}
          <a
            href="https://www.fma.govt.nz"
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            www.fma.govt.nz
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="3. How our AI works and its limitations">
        <p>
          Our reports are generated using artificial intelligence and large language models applied to
          market data and news. AI systems have important limitations you must understand:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            AI can produce inaccurate, incomplete or misleading output (sometimes called
            &quot;hallucinations&quot;) that appears confident but is wrong.
          </li>
          <li>
            Predictions, projections, pathways and momentum graphs are estimates and probabilistic
            scenarios — not statements of fact or guarantees of future results.
          </li>
          <li>
            Market data used by the Service may be delayed, simulated, estimated or sourced from third
            parties, and may contain errors.
          </li>
          <li>AI output does not reflect real-time execution prices, fees, spreads, tax or slippage.</li>
        </ul>
        <p>
          You should independently verify any information before relying on it, and treat all AI output
          with appropriate professional scepticism.
        </p>
      </LegalSection>

      <LegalSection heading="4. No guarantee of performance">
        <p>
          <strong className="text-foreground/90">
            Past performance is not a reliable indicator of future performance.
          </strong>{" "}
          Investing in shares, digital assets and other financial products involves risk, including the
          risk of losing some or all of your capital. Digital assets in particular are highly volatile
          and may not be regulated in the same way as traditional financial products. AetherForge AI does
          not guarantee any outcome, return or level of performance.
        </p>
      </LegalSection>

      <LegalSection heading="5. Your responsibility">
        <p>
          Any decision you make using information from AetherForge AI is made solely at your own risk and
          discretion. You are responsible for your own investment decisions and for ensuring they are
          appropriate for your circumstances. To the maximum extent permitted by law, AetherForge AI
          accepts no liability for any loss or damage arising from your reliance on AI-generated content
          or any other information provided by the Service. This section is subject to your rights under
          the Consumer Guarantees Act 1993 and other New Zealand law that cannot be excluded.
        </p>
      </LegalSection>

      <LegalSection heading="6. No fiduciary relationship">
        <p>
          Using the Service does not create any advisory, fiduciary or professional relationship between
          you and AetherForge AI. We do not act as your broker, adviser, custodian or agent, and we do
          not manage money or hold client funds.
        </p>
      </LegalSection>

      <LegalSection heading="7. Third-party content">
        <p>
          The Service may reference or incorporate data, news and content from third parties. We do not
          endorse or guarantee the accuracy of third-party content, and we are not responsible for it.
        </p>
      </LegalSection>

      <LegalSection heading="8. Questions">
        <p>
          If you have any questions about this disclaimer, please contact us at{" "}
          <a href="mailto:support@aetherforgeai.co.nz" className="text-primary hover:underline">
            support@aetherforgeai.co.nz
          </a>
          . By continuing to use AetherForge AI you acknowledge that you have read and understood this
          disclaimer.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
