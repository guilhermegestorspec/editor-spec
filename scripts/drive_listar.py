#!/usr/bin/env python3
"""Lista o conteúdo de uma pasta PÚBLICA do Google Drive sem baixar nada.

Uso:
  python3 scripts/drive_listar.py "https://drive.google.com/drive/folders/ID" [--profundidade 3] [--json]

Saída: uma linha por item ("pasta/subpasta/arquivo.mp4  <link>").
Para baixar só o que precisar:  python3 -m gdown "<link do arquivo>" -O destino/
(O link precisa estar como "Qualquer pessoa com o link".)
"""
import argparse
import html
import json
import re
import sys
import urllib.request

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"


def id_da_url(url: str) -> str:
    for padrao in (r"/folders/([\w-]+)", r"[?&]id=([\w-]+)", r"/d/([\w-]+)"):
        m = re.search(padrao, url)
        if m:
            return m.group(1)
    if re.fullmatch(r"[\w-]{10,}", url):
        return url
    raise SystemExit(f"Não reconheci o link do Drive: {url}")


def listar_pasta(pasta_id: str):
    req = urllib.request.Request(f"https://drive.google.com/embeddedfolderview?id={pasta_id}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        h = r.read().decode("utf-8", "replace")
    if "flip-entry" not in h and "flip-entries" not in h:
        raise RuntimeError("pasta não está pública ou não existe")
    itens = []
    for bloco in re.findall(r'<div class="flip-entry".*?</a>\s*</div>', h, re.S):
        nome = re.search(r'<div class="flip-entry-title">(.*?)</div>', bloco, re.S)
        link = re.search(r'href="([^"]+)"', bloco)
        if not (nome and link):
            continue
        url = html.unescape(link.group(1))
        itens.append({"nome": html.unescape(nome.group(1)).strip(), "url": url, "pasta": "/folders/" in url})
    return itens


def percorrer(pasta_id, prefixo, prof, saida, limite):
    for it in listar_pasta(pasta_id):
        if len(saida) >= limite:
            return
        caminho = f"{prefixo}{it['nome']}"
        if it["pasta"]:
            saida.append({"caminho": caminho + "/", "url": it["url"], "tipo": "pasta"})
            if prof > 1:
                try:
                    percorrer(id_da_url(it["url"]), caminho + "/", prof - 1, saida, limite)
                except Exception as e:  # subpasta privada etc.
                    saida.append({"caminho": caminho + "/", "url": it["url"], "tipo": f"erro: {e}"})
        else:
            saida.append({"caminho": caminho, "url": it["url"], "tipo": "arquivo"})


def main():
    p = argparse.ArgumentParser()
    p.add_argument("link")
    p.add_argument("--profundidade", type=int, default=3)
    p.add_argument("--limite", type=int, default=500)
    p.add_argument("--json", action="store_true")
    a = p.parse_args()
    url = a.link
    if "/file/d/" in url or "/open?id=" in url or "uc?id=" in url:
        print(json.dumps([{"caminho": "(arquivo único)", "url": url, "tipo": "arquivo"}]) if a.json else f"(arquivo único)  {url}")
        return
    saida = []
    try:
        percorrer(id_da_url(url), "", a.profundidade, saida, a.limite)
    except Exception as e:
        sys.exit(f"Não foi possível listar: {e}. Confira se o compartilhamento está como 'Qualquer pessoa com o link'.")
    if a.json:
        print(json.dumps(saida, ensure_ascii=False, indent=1))
    else:
        for it in saida:
            print(f"{it['caminho']}  {it['url']}" + ("" if it["tipo"] in ("arquivo", "pasta") else f"  [{it['tipo']}]"))
        if len(saida) >= a.limite:
            print(f"... (parei em {a.limite} itens; use --limite ou liste uma subpasta)")


if __name__ == "__main__":
    main()
