# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for DataAnalysis desktop bundle.
# Run via: python build_dist.py   (or: pyinstaller DataAnalysis.spec)

from PyInstaller.utils.hooks import collect_all

block_cipher = None

# Collect all sub-packages and data files for packages that PyInstaller
# won't discover automatically through static imports.
_extra_datas: list = [('frontend/dist', 'static')]
_extra_bins:  list = []
_extra_hidden: list = []

for _pkg in ('uvicorn', 'fastapi', 'starlette', 'anyio', 'h11'):
    _d, _b, _h = collect_all(_pkg)
    _extra_datas  += _d
    _extra_bins   += _b
    _extra_hidden += _h

a = Analysis(
    ['backend/main.py'],
    pathex=['.'],
    binaries=_extra_bins,
    datas=_extra_datas,
    hiddenimports=_extra_hidden + [
        'click',
        'multipart',
        'python_multipart',
        'email.mime.text',
        'email.mime.multipart',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'numpy', 'PIL'],
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='DataAnalysis',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    # console=True keeps a terminal window visible — useful for seeing errors.
    # Change to False for a silent background process once everything is stable.
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='DataAnalysis',
)
