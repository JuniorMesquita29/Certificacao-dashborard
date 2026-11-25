#!/usr/bin/env python3
"""Gera metrics/metrics.json para a Page 'Certificação — Ganho e Pipeline'.
Entradas: raw/tasks-1636047-p*.json, raw/tasks-1732324-p*.json, comments-by-task.json,
sel-1636047.txt / sel-1732324.txt (tasks cujos comentários foram buscados).
Uso: python3 build_metrics.py [--asof 2026-11-23T18:11]  (padrão: mtime mais recente dos raw)
"""
import json, re, glob, os, sys, statistics as S, collections as C
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
B = os.path.dirname(os.path.abspath(__file__)); TZ = ZoneInfo('America/Sao_Paulo')
LISTS = {1636047: 'Certificação (fila geral)', 1732324: 'Info. Pendente Certificação'}
STAGES = {'0': 'Backlog (sem etapa)', '48752': 'Info. pend. (provável)', '48755': 'AG. COTAÇÃO (provável)', '48760': 'Prioridade (provável)'}
PROCESS_TAGS = {'Alexia','Tayná','Vanessa','Gabriel','Isabelli','Mayla','Luiza','Rodrigo','Lethycia','Luana','Mariana','Isabela'}

def dt(s): return datetime.fromisoformat(s.replace('Z', '+00:00')).astimezone(TZ) if s else None
def field(desc, *ks):
    for k in ks:
        m = re.search(r'^\s*' + re.escape(k) + r'\s*:(.*)$', desc, re.M | re.I)
        if m:
            v = m.group(1).strip().strip('\\').strip()
            if v and v not in '-': return v
    return ''
def norm(s):
    s = re.sub(r'\s+', ' ', s).strip(' .\\-')
    return ' '.join(w.capitalize() for w in s.split(' ')) if s else ''
def ncms(s):
    out = []
    for p in re.split(r'//|;|\n|\s/\s|,(?=\s*\d{4})|\|', s):
        d = re.sub(r'\D', '', p)
        if 6 <= len(d) <= 10: out.append(d[:8])
    return out

NEG = re.compile(r'sem certifica|n[ãa]o (precisa|necessita|exige|tem|possui|ser[áa] (necess[áa]ri[oa]|exigida))\w*( de)? certifica|sem necessidade de certifica|n[ãa]o precisam certificar|n[ãa]o h[áa] necessidade de certifica|n[ãa]o exige certifica', re.I)
POS = re.compile(r'estimativas? (inmetro|anatel|anvisa)|com (valor de )?certifica|custo de certifica|valor (estimado )?(para a |de )certifica|precisa certificar|necess[áa]rio realizar certifica|o valor inclui ocp|manuten[çc][ãa]o do certificado', re.I)
PEND = re.compile(r'certifica[çc][ãa]o em an[áa]lise|@certifica[çc][ãa]o', re.I)
TYPES = {'INMETRO': r'inmetro', 'ANATEL': r'anatel', 'ANVISA': r'anvisa', 'MAPA': r'\bmapa\b', 'Exército': r'ex[ée]rcito', 'IBAMA': r'ibama'}

def main():
    T, U, TG, mt = [], {}, {}, 0
    for f in sorted(glob.glob(B + '/raw/tasks-*-p*.json')):
        d = json.load(open(f)); T += d['tasks']; U.update(d['included']['users']); TG.update(d['included']['tags']); mt = max(mt, os.path.getmtime(f))
    mt = max(mt, os.path.getmtime(B + '/comments-by-task.json')); asof = datetime.fromtimestamp(mt, TZ)
    if '--asof' in sys.argv: asof = datetime.fromisoformat(sys.argv[sys.argv.index('--asof') + 1]).replace(tzinfo=TZ)
    uname = lambda i: (lambda u: (u['firstName'] + ' ' + u['lastName']).strip() if u else str(i))(U.get(str(i)))
    CM = json.load(open(B + '/comments-by-task.json'))
    sel = set()
    for f in glob.glob(B + '/sel-*.txt'): sel |= {int(x) for x in re.findall(r'\d+', open(f).read())}

    rows = []
    for t in T:
        ds = t['description'] or ''; ca = dt(t['createdAt']); co = dt(t.get('completedAt')) if t['status'] == 'completed' else None
        tags = [TG[str(i)]['name'] for i in (t.get('tagIds') or []) if str(i) in TG]
        cs = [c for c in CM.get(str(t['id']), []) if not c.get('deleted')]
        cs.sort(key=lambda c: c['postedDateTime'])
        txt = '\n'.join(c.get('body') or '' for c in cs)
        neg, pos, pend = bool(NEG.search(txt)), bool(POS.search(txt)), bool(PEND.search(txt))
        if not cs: cls = None
        elif pos: cls = 'Precisa certificação'
        elif neg: cls = 'Sem certificação'
        elif pend: cls = 'Em análise / sem resposta'
        else: cls = 'Indefinido'
        types = [k for k, p in TYPES.items() if re.search(p, txt + '\n' + t['name'], re.I)] if cls == 'Precisa certificação' else []
        rows.append(dict(id=t['id'], name=t['name'].strip(), list=t['tasklistId'], status='Concluída' if t['status'] == 'completed' else 'Aberta',
            created=ca, completed=co, lead=(co - ca).total_seconds() / 86400 if co else None, updated=dt(t.get('updatedAt')),
            stage=STAGES.get(str((t.get('workflowStages') or [{}])[0].get('stageId', 0)), 'Outra'),
            comercial=norm(field(ds, 'Responsável Comercial')), cliente=field(ds, 'Nome da empresa'), produto=field(ds, 'Produto(s)', 'Produto'),
            ncm=ncms(field(ds, 'HS Code/NCM')), tags=tags, analista=[x for x in tags if x in PROCESS_TAGS],
            assignees=[uname(i) for i in (t.get('assigneeUserIds') or [])], creator=uname(t.get('createdBy')) if t.get('createdBy') else '',
            completedBy=uname(t['completedBy']) if t.get('completedBy') else '', fetched=t['id'] in sel or str(t['id']) in CM,
            ncomments=len(cs), lastComment=dt(cs[-1]['postedDateTime']) if cs else None, cls=cls, both=pos and neg, types=types,
            commenters=[uname(c['postedByUserId']) for c in cs]))

    R = {}
    R['asof'] = asof.strftime('%d/%m/%Y %H:%M')
    R['lists'] = {LISTS[l]: dict(C.Counter(r['status'] for r in rows if r['list'] == l)) for l in LISTS}
    R['total'] = len(rows)
    # volume mensal (todas as tasks, ambas listas)
    months = sorted({r['created'].strftime('%Y-%m') for r in rows})
    y0, m0 = map(int, months[0].split('-')); y1, m1 = map(int, months[-1].split('-')); allm = []
    while (y0, m0) <= (y1, m1): allm.append(f'{y0}-{m0:02d}'); m0 += 1; y0, m0 = (y0 + 1, 1) if m0 > 12 else (y0, m0)
    R['monthly'] = [dict(m=m, created=sum(1 for r in rows if r['created'].strftime('%Y-%m') == m),
        completed=sum(1 for r in rows if r['completed'] and r['completed'].strftime('%Y-%m') == m),
        open_now=sum(1 for r in rows if r['created'].strftime('%Y-%m') == m and r['status'] == 'Aberta'),
        lead_median=(lambda v: round(S.median(v), 1) if v else None)([r['lead'] for r in rows if r['lead'] is not None and r['created'].strftime('%Y-%m') == m]),
        lead_n=sum(1 for r in rows if r['lead'] is not None and r['created'].strftime('%Y-%m') == m)) for m in allm]
    L = sorted(r['lead'] for r in rows if r['lead'] is not None)
    L12 = sorted(r['lead'] for r in rows if r['lead'] is not None and (asof - r['created']).days <= 90)
    q = lambda v, p: round(v[min(len(v) - 1, int(p * len(v)))], 1)
    R['lead'] = dict(n=len(L), median=round(S.median(L), 1), p75=q(L, .75), p90=q(L, .9), n90d=len(L12), median90d=round(S.median(L12), 1) if L12 else None,
        buckets=[dict(b=b, n=sum(1 for x in L if lo <= x < hi)) for b, lo, hi in [('< 1 dia', 0, 1), ('1–3 dias', 1, 3), ('3–7 dias', 3, 7), ('7–15 dias', 7, 15), ('15–30 dias', 15, 30), ('30–90 dias', 30, 90), ('> 90 dias', 90, 1e9)]])
    op = [r for r in rows if r['status'] == 'Aberta']
    R['open_age'] = [dict(b=b, n=sum(1 for r in op if lo <= (asof - r['created']).days < hi)) for b, lo, hi in [('< 7 dias', 0, 7), ('7–30 dias', 7, 30), ('30–90 dias', 30, 90), ('90–365 dias', 90, 365), ('> 1 ano', 365, 1e9)]]
    R['stages_open'] = {l: dict(C.Counter(r['stage'] for r in op if r['list'] == l)) for l in LISTS}
    R['pending'] = sorted([dict(id=r['id'], name=r['name'], created=r['created'].strftime('%d/%m/%Y'), dias=(asof - r['created']).days,
        dias_sem_mov=(asof - max(x for x in [r['updated'], r['lastComment']] if x)).days, analista=', '.join(r['analista']) or '—', comercial=r['comercial'] or '—',
        comments=r['ncomments'], cls=r['cls'] or 'Sem comentários') for r in op if r['list'] == 1732324], key=lambda x: -x['dias'])
    R['aguard_cert'] = sorted([dict(id=r['id'], name=r['name'], status=r['status'], created=r['created'].strftime('%d/%m/%Y'), dias=(asof - r['created']).days)
        for r in rows if 'Aguard. Cert.' in r['tags']], key=lambda x: (x['status'] != 'Aberta', -x['dias']))
    F = [r for r in rows if r['fetched']]; FC = [r for r in F if r['ncomments']]
    R['class'] = dict(fetched=len(F), with_comments=len(FC), counts=dict(C.Counter(r['cls'] for r in FC)), both=sum(1 for r in FC if r['both'] and r['cls'] == 'Precisa certificação'),
        by_list={LISTS[l]: dict(C.Counter(r['cls'] for r in FC if r['list'] == l)) for l in LISTS}, open_counts=dict(C.Counter(r['cls'] for r in FC if r['status'] == 'Aberta')))
    PC = [r for r in FC if r['cls'] == 'Precisa certificação']
    R['types'] = dict(C.Counter(t for r in PC for t in r['types'])); R['types_none'] = sum(1 for r in PC if not r['types'])
    R['precisa_list'] = [dict(id=r['id'], name=r['name'], status=r['status'], types=', '.join(r['types']) or '—', created=r['created'].strftime('%d/%m/%Y'), ncm=', '.join(r['ncm'][:3]) or '—') for r in sorted(PC, key=lambda r: r['created'], reverse=True)]
    withn = [r for r in rows if r['ncm']]
    R['ncm'] = dict(tasks_with_ncm=len(withn), top4=C.Counter(n[:4] for r in withn for n in set(x[:4] for x in r['ncm'])).most_common(12),
        top4_precisa=C.Counter(n for r in PC for n in set(x[:4] for x in r['ncm'])).most_common(10))
    R['tags'] = C.Counter(x for r in rows for x in r['tags'] if x not in PROCESS_TAGS and not re.match(r'^(SM|ID)\d', x) and x != '-').most_common(12)
    R['load_analista'] = sorted([dict(name=a, total=sum(1 for r in rows if a in r['analista']), open=sum(1 for r in op if a in r['analista'])) for a in {x for r in rows for x in r['analista']}], key=lambda x: -x['total'])
    R['load_comercial'] = [dict(name=k, total=v, open=sum(1 for r in op if r['comercial'] == k)) for k, v in C.Counter(r['comercial'] for r in rows if r['comercial']).most_common(12)]
    last12 = [r for r in rows if (asof - r['created']).days <= 365]
    R['load_comercial_12m'] = C.Counter(r['comercial'] for r in last12 if r['comercial']).most_common(12)
    R['load_analista_12m'] = C.Counter(a for r in last12 for a in r['analista']).most_common(10)
    R['completed_by_12m'] = C.Counter(r['completedBy'] for r in last12 if r['completedBy']).most_common(10)
    R['commenters_precisa'] = C.Counter(n for r in FC for n in set(r['commenters'])).most_common(10)
    json.dump(R, open(B + '/metrics/metrics.json', 'w'), ensure_ascii=False, indent=1, default=str)
    print(json.dumps(R, ensure_ascii=False, default=str)[:200000])
main()
