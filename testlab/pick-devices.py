"""Filtra o catálogo do Test Lab e escolhe um leque de aparelhos para o robo.

O catálogo NÃO expõe preço nem data de lançamento (campos reais: brand,
codename, form, formFactor, id, manufacturer, name, perVersionInfo,
screenDensity, screenX, screenY, supportedAbis, supportedVersionIds,
thumbnailUrl). Então:

  "novo/antigo"  -> API máxima suportada
  "caro/barato"  -> pixels de tela (entrada no Brasil = HD+ 720x1600)

Uso: pick-devices.py <models.json> <saida.txt> <max> [marca ...]
"""

import json
import sys


def max_api(model):
    apis = [int(v) for v in model.get("supportedVersionIds", []) if v.isdigit()]
    return max(apis) if apis else 0


def min_api(model):
    apis = [int(v) for v in model.get("supportedVersionIds", []) if v.isdigit()]
    return min(apis) if apis else 0


def main():
    src, out, cap = sys.argv[1], sys.argv[2], int(sys.argv[3])
    brands = [b.lower() for b in sys.argv[4:]]

    models = json.load(open(src, encoding="utf-8"))

    cands = [
        m for m in models
        if m.get("form") == "PHYSICAL"
        and m.get("formFactor") == "PHONE"
        # dobráveis custam um slot da cota e não representam o público 60+
        and not any(w in m.get("name", "") for w in ("Fold", "Flip", "TriFold"))
        and (not brands or m.get("brand", "").lower() in brands
             or m.get("manufacturer", "").lower() in brands)
    ]

    if not brands:
        print("marcas físicas disponíveis:")
        for b in sorted({m["brand"] for m in cands}):
            print(f"   {b} ({sum(1 for m in cands if m['brand'] == b)})")
        sys.exit("\ninforme ao menos uma marca: devices <marca> [marca ...]")

    if not cands:
        sys.exit(f"nenhum aparelho físico para: {', '.join(brands)}")

    cands.sort(key=lambda m: (max_api(m), m["screenX"] * m["screenY"]))

    print(f"{'API':<8} {'MODEL_ID':<18} {'MARCA':<10} {'APARELHO':<28} TELA")
    for m in cands:
        rng = f"{min_api(m)}-{max_api(m)}"
        print(f"{rng:<8} {m['id']:<18} {m['brand']:<10} {m['name'][:28]:<28} "
              f"{m['screenX']}x{m['screenY']}")

    # Leque: mais antigo, mais novo, mais barato, mais caro, e um do meio.
    # dict.fromkeys preserva a ordem e mata duplicata quando o mesmo aparelho
    # ganha dois eixos (catálogo pequeno) — sem isso a seleção viria curta.
    by_px = sorted(cands, key=lambda m: m["screenX"] * m["screenY"])
    axes = [
        ("mais antigo", cands[0]),
        ("mais novo", cands[-1]),
        ("tela mais baixa", by_px[0]),
        ("tela mais alta", by_px[-1]),
        ("meio", cands[len(cands) // 2]),
    ]
    picked, seen = [], set()
    for why, m in axes:
        if m["id"] not in seen and len(picked) < cap:
            seen.add(m["id"])
            picked.append((why, m))

    # Os eixos se sobrepõem com frequência (o mais antigo costuma ser também o
    # de tela mais baixa), o que devolvia menos aparelhos que a cota permite.
    # Completa varrendo a lista ordenada por API em passos iguais.
    if len(picked) < cap and len(cands) > len(picked):
        step = max(1, len(cands) // (cap + 1))
        for i in range(0, len(cands), step):
            if len(picked) >= cap:
                break
            m = cands[i]
            if m["id"] not in seen:
                seen.add(m["id"])
                picked.append(("leque", m))
        picked.sort(key=lambda p: max_api(p[1]))

    with open(out, "w", encoding="utf-8") as fh:
        for why, m in picked:
            fh.write(f"{m['id']},{max_api(m)}\t# {m['brand']} {m['name']} "
                     f"({m['screenX']}x{m['screenY']}, {why})\n")

    print(f"\nseleção ({len(picked)} de {len(cands)}) -> {out}")
    for why, m in picked:
        print(f"   {m['id']},{max_api(m)}  {m['brand']} {m['name']}  [{why}]")


if __name__ == "__main__":
    main()
