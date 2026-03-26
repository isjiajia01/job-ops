import { describe, expect, it } from "vitest";
import { __testOnly } from "../src/run";

describe("thehub extractor JSON-LD fallback", () => {
  it("extracts JobPosting details when Nuxt state is unavailable", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "JobPosting",
              "title": "Business Analyst",
              "description": "Support operations and reporting across teams.",
              "datePosted": "2026-03-20",
              "validThrough": "2026-04-20",
              "employmentType": ["FULL_TIME", "PART_TIME"],
              "hiringOrganization": {
                "@type": "Organization",
                "name": "Resights",
                "sameAs": "https://resights.com"
              },
              "jobLocation": {
                "@type": "Place",
                "address": {
                  "@type": "PostalAddress",
                  "streetAddress": "Vesterbrogade 1",
                  "addressLocality": "Copenhagen",
                  "addressCountry": "DK"
                }
              }
            }
          </script>
        </head>
      </html>
    `;

    const details = __testOnly.extractJobDetailsFromHtml(html);

    expect(details).toMatchObject({
      title: "Business Analyst",
      description: "Support operations and reporting across teams.",
      publishedAt: "2026-03-20",
      expirationDate: "2026-04-20",
      employmentTypeLabels: ["FULL_TIME", "PART_TIME"],
      company: {
        name: "Resights",
        website: "https://resights.com",
      },
      location: {
        address: "Vesterbrogade 1",
        locality: "Copenhagen",
        country: "DK",
      },
    });
  });
});
