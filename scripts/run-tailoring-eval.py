import json
from pathlib import Path
import requests
from requests.auth import HTTPBasicAuth

BASE_URL = "http://127.0.0.1:3005"
AUTH = HTTPBasicAuth("jobops", "ajhg0Pdm1qAuVWYtleJCN67CKnaOQdta")
FIXTURE_PATH = Path("/opt/job-ops/scripts/tailoring-eval-fixtures/denmark-planning.json")


def contains_keyword(text: str, keyword: str) -> bool:
    return keyword.lower() in text.lower()


def flatten_payload(data: dict) -> str:
    skills = []
    for group in data.get("tailoredSkillsParsed") or []:
        skills.append(group.get("name", ""))
        skills.extend(group.get("keywords") or [])
    bullets = []
    for edit in data.get("tailoredExperienceEditsParsed") or []:
        bullets.extend(edit.get("bullets") or [])
    section_order = ((data.get("tailoredLayoutDirectivesParsed") or {}).get("sectionOrder") or [])
    return "\n".join([
        data.get("tailoredHeadline") or "",
        data.get("tailoredSummary") or "",
        *skills,
        *bullets,
        *section_order,
        data.get("tailoredSectionRationale") or "",
        data.get("tailoredOmissionRationale") or "",
    ])


def score_fixture(fixture: dict, data: dict):
    score = 0
    notes = []
    blob = flatten_payload(data)
    expected = fixture["expected"]

    if (data.get("tailoredHeadline") or "").strip() == expected["headline"]:
        score += 2
        notes.append("headline exact")
    elif contains_keyword(data.get("tailoredHeadline") or "", expected["headline"]):
        score += 1
        notes.append("headline partial")
    else:
        notes.append("headline weak")

    required_hits = [kw for kw in expected["requiredKeywords"] if contains_keyword(blob, kw)]
    if len(required_hits) >= max(2, (len(expected["requiredKeywords"]) + 1) // 2):
        score += 2
        notes.append(f"required keywords ok ({len(required_hits)})")
    elif required_hits:
        score += 1
        notes.append(f"required keywords partial ({len(required_hits)})")
    else:
        notes.append("required keywords weak")

    forbidden_hits = [kw for kw in expected["forbiddenKeywords"] if contains_keyword(blob, kw)]
    if not forbidden_hits:
        score += 2
        notes.append("no forbidden claims")
    elif len(forbidden_hits) == 1:
        score += 1
        notes.append(f"one forbidden hit: {forbidden_hits[0]}")
    else:
        notes.append("forbidden hits: " + ", ".join(forbidden_hits))

    rewrite_count = len(data.get("tailoredExperienceEditsParsed") or [])
    if (not expected["shouldRewriteExperience"]) or rewrite_count > 0:
        score += 2
        notes.append(f"experience edits: {rewrite_count}")
    else:
        notes.append("missing experience rewrites")

    actual_order = ((data.get("tailoredLayoutDirectivesParsed") or {}).get("sectionOrder") or [])
    prefix = expected["preferredSectionOrderPrefix"]
    prefix_matches = all(index < len(actual_order) and actual_order[index] == value for index, value in enumerate(prefix))
    if prefix_matches:
        score += 2
        notes.append("section order aligned")
    elif actual_order:
        score += 1
        notes.append("section order partial: " + " > ".join(actual_order))
    else:
        notes.append("missing section order")

    rationale_ok = bool((data.get("tailoredSectionRationale") or "").strip()) and bool((data.get("tailoredOmissionRationale") or "").strip())
    if rationale_ok:
        score += 2
        notes.append("rationales present")
    else:
        notes.append("missing rationale fields")

    return score, notes


def main():
    fixtures = json.loads(FIXTURE_PATH.read_text())
    for fixture in fixtures:
        print("---")
        print(fixture["id"])
        payload = {
            "title": fixture["jobTitle"],
            "employer": "Eval Sample",
            "jobUrl": f"https://example.com/eval/{fixture['id']}",
            "applicationLink": f"https://example.com/eval/{fixture['id']}/apply",
            "location": "Copenhagen",
            "jobDescription": fixture["jobDescription"],
            "status": "discovered",
        }
        create_job = requests.post(f"{BASE_URL}/api/manual-jobs/import", auth=AUTH, json={"job": payload}, timeout=180)
        if not create_job.ok:
            print("FAILED job create", create_job.status_code, create_job.text[:400])
            continue
        job = create_job.json().get("data") or {}
        job_id = job.get("id")
        summarize = requests.post(f"{BASE_URL}/api/jobs/{job_id}/summarize?force=true", auth=AUTH, timeout=180)
        if not summarize.ok:
            print("FAILED summarize", summarize.status_code, summarize.text[:400])
            continue
        data = summarize.json().get("data") or {}
        data["tailoredSkillsParsed"] = json.loads(data.get("tailoredSkills") or "[]") if data.get("tailoredSkills") else []
        data["tailoredExperienceEditsParsed"] = json.loads(data.get("tailoredExperienceEdits") or "[]") if data.get("tailoredExperienceEdits") else []
        data["tailoredLayoutDirectivesParsed"] = json.loads(data.get("tailoredLayoutDirectives") or "{}") if data.get("tailoredLayoutDirectives") else {}
        score, notes = score_fixture(fixture, data)
        print("score=", score, "/ 12")
        print("notes=", " | ".join(notes))
        print("headline=", data.get("tailoredHeadline"))
        print("sectionOrder=", data["tailoredLayoutDirectivesParsed"].get("sectionOrder", []))
        print("experienceEdits=", len(data["tailoredExperienceEditsParsed"]))


if __name__ == "__main__":
    main()
