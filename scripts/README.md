# Como atualizar os dados

O site lê apenas `data/metrics.json`. Atualizar o dashboard é trocar esse arquivo e publicar de novo na branch `main`. Não edite números na mão.

## Gerar o JSON

`build_metrics.py` lê a extração bruta do Teamwork e grava `metrics/metrics.json` na mesma pasta do script.

Coloque estes arquivos ao lado do script (em `scripts/`):

- `raw/tasks-1636047-p*.json` e `raw/tasks-1732324-p*.json` — tasks das listas Certificação (fila geral, 1636047) e Info. Pendente Certificação (1732324)
- `comments-by-task.json` — comentários
- `sel-1636047.txt` e `sel-1732324.txt` — ids das tasks cujos comentários foram buscados

```bash
python3 scripts/build_metrics.py
python3 scripts/build_metrics.py --asof 2026-11-23T18:11
```

Sem `--asof`, a data de referência é a hora de modificação mais recente dos arquivos em `raw/` (fuso de Brasília).

Copie a saída para o site:

```bash
cp scripts/metrics/metrics.json data/metrics.json
```

## Classificação e limites

A classificação (Precisa certificação / Sem certificação / Em análise / sem resposta / Indefinido) usa palavras-chave nos comentários. As expressões estão em `NEG`, `POS` e `PEND` no script. Se o texto casa com o padrão positivo e o negativo, a task fica em "Precisa certificação" e entra na contagem `both`.

As etapas `48752`, `48755` e `48760` estão mapeadas como "Info. pend. (provável)", "AG. COTAÇÃO (provável)" e "Prioridade (provável)". Esse mapa não foi confirmado no CLP.

Receita, custo de laboratório, organismo (OCP), ensaio e amostra, margem e conversão de cotação em projeto não existem na extração. O site mostra essa lista em "Dados necessários" e não desenha gráfico vazio para esses itens.
