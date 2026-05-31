# Vigora Saúde — Photography Generation Prompt

## Master Prompt Template

Use this template with gpt-image-2, DALL-E 3, or Midjourney. Fill in [SCENE] and [CAST] for each use case.

```
[SCENE]. [CAST]. Natural window light, warm afternoon. Film grain texture. 
Documentary feel. Real Brazilian home / park / kitchen. Slightly off-center 
composition. Authentic imperfection. No text visible in image. No watermarks. 
No studio strobes. No white infinity background. No stock-photo perfection. 
No hospital equipment. No medical charts. Warm tones, creme and deep blue palette.
```

---

## Art Direction Principles

### Subject
Idosos brasileiros em contexto real de vida: cozinha, sala com TV, varanda, parque do bairro, videochamada com filhos. Not posed. Not in clinical settings. Doing something real — drinking coffee, looking at phone, walking, cooking.

### Light
Natural only. Window light, late afternoon sun, overcast soft light. Never: studio strobes, ring lights, three-point lighting setups. The light should feel like it was already there.

### Cast — Diversidade Brasileira (specify explicitly per prompt)
Always specify ethnicity mix. Examples:
- "mulher negra de 70 anos"
- "casal pardo de aposentados"
- "homem branco de 65 anos com cabelos brancos"
- "família mista — mãe idosa parda, filha adulta negra"
Mix genders. Include spouses, children in background when natural. The cast should look like the Brazil you see in São Paulo, Bahia, Minas Gerais — not a brochure.

### Composition
- Slightly imperfect: off-center, some subject movement blur is acceptable
- Real environments: furniture, clutter, plants, family photos on walls
- Rule of thirds — not centered
- Avoid symmetry

### Film Grain
Always include grain. Specify: "film grain texture, 35mm feel, slight color bleed". This is non-negotiable — it's the texture that separates brand photography from AI-generated stock.

---

## What to AVOID (Use as Negative Prompt in SD)

```
studio strobes, white infinity background, stock-photo energy, perfect symmetry, 
AI-smooth skin, clinical white walls, hospital equipment, medical charts, 
stethoscope, white coat, medicine bottles with labels, scared elderly person, 
sad elderly person, crying, text on screen, visible watermarks, 
young people only, green screen, fake plants, unnatural poses,
oversaturated colors, HDR processing
```

---

## Example Prompts

### 1. Elderly Morning Walk (Passeio matinal)
```
Elderly Brazilian woman, approximately 68 years old, dark skin, white hair, 
walking alone in a neighborhood park in São Paulo, early morning light, 
concrete benches visible in background, wearing everyday clothes not sportswear, 
slightly ahead of camera at an angle, candid not posed. Film grain texture. 
Documentary feel. Real Brazilian urban park. Off-center composition. 
Warm morning light, long shadows. No text visible. No watermarks.
```

### 2. Family Video Call (Videochamada em família)
```
Brazilian elderly couple, man and woman approximately 70 years old, mixed race 
(she is parda, he is white with grey beard), sitting at a kitchen table, 
looking at a tablet or phone screen showing a video call, warm kitchen with 
real dishes and plants visible. Afternoon window light from the left. 
Expressions warm and amused — mid-conversation, not posed smile. 
Film grain texture. 35mm documentary feel. No text visible on screen. 
No watermarks. Real Brazilian kitchen.
```

### 3. Medication Moment (Momento do remédio)
```
Brazilian elderly man, approximately 72 years old, negro, grey hair, 
sitting at a dining table with a small glass of water and medication in hand 
— no labels visible on bottles. Early morning light. Calm, routine feeling, 
not clinical. Background shows a real Brazilian sala: TV, family photos, 
bookshelf. Slightly off-center, film grain, documentary tone. 
No medical equipment. No white surfaces. No text visible. No watermarks.
```

---

## Platform-Specific Notes

### DALL-E 3 / gpt-image-2
Paste the prompt directly. Add: "Photorealistic. Warm color palette." at the end.

### Midjourney
Add to end: `--ar 4:3 --style raw --v 6.1 --no text, watermark, studio lighting`

### Stable Diffusion
- Positive: use prompt above + "masterpiece, best quality, photorealistic, 35mm film"
- Negative: use the AVOID list above verbatim

### Adobe Firefly
Enable "Match image style" with a reference photo from the brand guidelines PDF.
