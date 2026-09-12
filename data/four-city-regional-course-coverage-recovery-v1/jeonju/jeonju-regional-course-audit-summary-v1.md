# JEONJU Regional Course Coverage Audit — 2026-09-12

## Summary

- Courses audited: 5 (incl. reserve)
- Total stop occurrences: 18
- Stops with canonical link: 17
  - Matched to existing canonical: 17
  - Canonicalization dropout (referenced but missing): 0
- Course context only (area/editorial, no canonical): 1
- Ambiguous: 0

## Content Coverage (matched stops only)

| Field         | OK | Missing |
|---------------|----|---------|
| Image         | 17 | 0 |
| Desc KO       | 0 | 17 |
| EN title/desc | 0 | 17 |
| JA title/desc | 0 | 17 |
| ZH title/desc | 0 | 17 |
| Coordinates   | 17 | 0 |

- Stops with RUNTIME_OK (all content present): 0/17 (0.0%)
- Stops with content gaps: 17

## Course Context Only (1 stops — area/editorial, no canonical needed)

- 전주비빔밥 거리 (풍남동) (course: 전주 전통문화 체험 & 미식 1일 코스, lt=RELATION_OR_AREA_ONLY)

## City-Specific Notes

- **JEONJU_STRUCTURAL_GAP**: The Jeonju canonical (`jeonju-final-service-catalog-v1.json`) has no `description_ko` field.
  All description gaps for Jeonju are structural — not individual content dropout.
  Recovery requires description collection as a separate pipeline phase.
- **JEONJU_MULTILINGUAL_STRUCTURAL_GAP**: No EN/JA/ZH content in canonical.
  Multilingual collection not yet started for Jeonju.
