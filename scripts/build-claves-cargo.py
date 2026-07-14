#!/usr/bin/env python3
"""
build-claves-cargo.py — Convierte la planilla de claves de radio a JSON.

Entrada : data/CLAVES_CARGO.xlsx   (hoja DB_CLAVES_CARGO: NOMBRE | CARGO O CLAVE | DESCRIPCION)
Salida  : data/claves-cargo.json   [{ nombre, clave, descripcion }]

El .xlsx no se publica (va en .gitignore); solo se versiona el JSON.
Uso: python3 scripts/build-claves-cargo.py
"""
import json
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = RAIZ / 'data' / 'CLAVES_CARGO.xlsx'
SALIDA = RAIZ / 'data' / 'claves-cargo.json'


def leer_filas(xlsx: Path):
    z = zipfile.ZipFile(xlsx)

    compartidas = []
    if 'xl/sharedStrings.xml' in z.namelist():
        raiz = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in raiz.iter(NS + 'si'):
            compartidas.append(''.join(t.text or '' for t in si.iter(NS + 't')))

    hoja = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    for fila in hoja.iter(NS + 'row'):
        valores = []
        for celda in fila:
            tipo = celda.get('t')
            v = celda.find(NS + 'v')
            if v is None:
                valores.append('')
            elif tipo == 's':
                valores.append(compartidas[int(v.text)])
            else:
                valores.append(v.text or '')
        yield valores


def limpiar_clave(bruto: str) -> str:
    """(JB) -> JB ; S-252 -> S-252"""
    return bruto.strip().strip('()').strip()


def main():
    if not ENTRADA.exists():
        sys.exit(f'No se encontró {ENTRADA}')

    filas = list(leer_filas(ENTRADA))[1:]  # salta el encabezado

    registros = []
    vistos = set()
    for f in filas:
        nombre = (f[0] if len(f) > 0 else '').strip()
        clave = limpiar_clave(f[1] if len(f) > 1 else '')
        desc = (f[2] if len(f) > 2 else '').strip()
        if not nombre:
            continue
        llave = (nombre.upper(), clave.upper())
        if llave in vistos:
            continue
        vistos.add(llave)
        registros.append({'nombre': nombre, 'clave': clave, 'descripcion': desc})

    registros.sort(key=lambda r: r['nombre'])
    SALIDA.write_text(json.dumps(registros, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(registros)} personas -> {SALIDA.relative_to(RAIZ)}')


if __name__ == '__main__':
    main()
