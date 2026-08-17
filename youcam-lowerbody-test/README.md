# YouCam Apparel VTO V3: standalone lower-body reference test

## Verdict

**Works unreliably / with conditions.** One V3 lower-body task successfully applied a standalone product image of trousers, even though the current documentation says standalone lower-body product references are unsupported. This is a single positive result, not evidence of general support; treat this route as experimental and retain a worn-reference fallback.

## Documentation and terms consulted (2026-08-06)

- [AI Clothes Virtual Try-On V3 overview, file specs, errors, upload/task/poll flow](https://docs.perfectcorp.com/reference/ai_clothes/section/overview)
- [AI Clothes V3 API playground](https://yce.perfectcorp.com/api-console/en/api-playground/ai-clothes/) (shows `auto`, `full_body`, `upper_body`, `lower_body`, and `shoes` garment-category choices)
- [YouCam Online Editor API Terms](https://www.perfectcorp.com/perfectbeauty/youcam/terms-of-service-api) (current terms at test time: June 2026)

V3 endpoints used:

1. `POST /s2s/v2.0/file/cloth-v3` for each image, followed by the returned presigned `PUT` upload.
2. `POST /s2s/v2.0/task/cloth-v3` with `src_file_id`, `ref_file_id`, and `garment_category: "lower_body"`.
3. `GET /s2s/v2.0/task/cloth-v3/{task_id}` until completion.

The docs require JPG/PNG, less than 10 MB, at least 512 × 384 px (maximum side 4096 px) and a single, forward-facing, upright person for the source. For a product reference they specify one front-facing garment, no composites. They also explicitly say: **“For the lower body, only actual worn outfits are supported, not standalone product images.”** This test deliberately probes that stated limitation.

## Inputs and provenance

| Local file | Source | Usage basis | Observed file characteristics / visual check |
| --- | --- | --- | --- |
| `inputs/person_youcam_sample.png` | `https://plugins-media.makeupar.com/strapi/assets/clothes_01_10be1e1a9b.png` | Official YouCam AI Clothes Playground/sample asset; used solely for this documented API compatibility test. | PNG, 1024 × 1024, 322,042 bytes. One full-body, forward-facing standing person; clean background; full face and lower body visible. |
| `inputs/trousers_met_cc0.jpg` | [Wikimedia Commons: *Trousers MET 1978.88.11 B.jpg*](https://commons.wikimedia.org/wiki/File:Trousers_MET_1978.88.11_B.jpg) | Metropolitan Museum of Art image supplied under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). | JPG, 1365 × 2551, 259,608 bytes. One standalone cream/off-white pair of trousers, front-facing and not worn or on a mannequin. |

No personal customer image was used. The person asset is an official API sample selected for its documented suitability and public platform use; no assertion is made about its identity beyond that provenance.

## Attempt record

| Attempt | VTO task creations | Parameters | Poll result | Output | Observed errors |
| --- | ---: | --- | --- | --- | --- |
| 01 | 1 | `src_file_id` = uploaded official sample; `ref_file_id` = uploaded standalone CC0 trousers; `garment_category` = `lower_body` | `running` then `success` | `outputs/attempt-01-result.png` | None (`error: null`) |

Only one VTO task was created (within the cap of four). An initial local PowerShell presigned-upload client call failed before any VTO task creation; it was replaced with the documented-style `PUT` transfer. It is not an API engine/input-quality result and did not consume a VTO task creation.

## Visual review

`outputs/attempt-01-result.png` is a successful 1024 × 1024 result. It clearly replaces the source skirt with cream trousers. Major identity cues were preserved: cream/off-white color, high waist, asymmetric front flap/buckle area, and straight-leg trouser category/silhouette. The result is plausible on the person but not product-faithful at fine detail: cloth wrinkles and hem proportions are smoothed, the leg shape is more tapered/shorter than the reference, and the closure, seams, and pocket construction are simplified or partly hallucinated. The source blouse, person, background, and boots are substantially retained.

## Artifacts

- `inputs/`: downloaded source/reference images.
- `outputs/`: generated successful result.
- `responses/`: redacted JSON request payloads, API responses, and poll history. Authorization data is not stored in any request artifact.
- `run-experiment.ps1`: repeatable test harness; it requires an in-memory `YOUCAM_API_KEY` environment variable and contains no key.

API generated artifacts are subject to the retention and other conditions in the linked YouCam API Terms; this local directory preserves the non-secret verification record.
