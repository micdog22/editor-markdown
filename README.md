# Editor Markdown

Editor de Markdown que roda no navegador, com pré-visualização ao vivo e exportação para `.md`, HTML e PDF. O diferencial está por dentro: o parser foi escrito do zero, segue a especificação CommonMark com as extensões do GitHub (GFM) e vem com mais de 800 testes. É um bom material para quem quer entender como um parser de Markdown funciona de verdade.

**Acesse online:** https://micdog22.github.io/editor-markdown/

## Recursos

- **Parser próprio, sem bibliotecas**: títulos ATX e setext, parágrafos, ênfase com as regras de aninhamento da especificação, links e imagens com título, links por referência, trechos e blocos de código (cercados e indentados), citações, listas ordenadas e com marcadores (apertadas e frouxas, aninhadas), quebras temáticas, quebras de linha, escapes com barra invertida e todas as entidades nomeadas do HTML5.
- **Extensões do GitHub**: tabelas com alinhamento, listas de tarefas, ~~tachado~~ e links automáticos para `www.`, `https://` e e-mails.
- **Saída segura**: HTML escrito no texto aparece como texto por padrão. Há uma opção que libera um subconjunto seguro (negrito, `<kbd>`, `<details>`, tabelas e afins), sem scripts, estilos ou atributos de evento. URLs `javascript:`, `vbscript:`, `data:` (fora imagens) e outros esquemas desconhecidos nunca viram links clicáveis.
- **Editor de verdade**: barra de ferramentas, atalhos, Enter que continua listas, Tab que indenta, desfazer (Ctrl+Z) funcionando em todas as ações, contagem de palavras e tempo de leitura.
- **Rolagem sincronizada** entre o texto e a pré-visualização, guiada pelas linhas de origem de cada bloco.
- **Tarefas clicáveis**: marcar a caixa na pré-visualização altera o `[ ]` no texto.
- **Assistente de tabela** para criar a estrutura e um botão que realinha as colunas da tabela onde está o cursor.
- **Salvamento automático** no `localStorage`, abrir arquivo pelo botão ou arrastando para o editor.
- **Exportação**: `.md`, HTML completo com o CSS embutido (abre em qualquer lugar, sem internet), cópia do HTML e impressão ou PDF pelo diálogo do navegador.
- Tema claro e escuro automático, layout para celular e navegação completa pelo teclado.

## Como usar

1. Abra a página e comece a escrever no painel da esquerda. O exemplo inicial mostra os recursos.
2. Use a barra de ferramentas ou os atalhos:

| Atalho | Ação |
| --- | --- |
| Ctrl+B / Ctrl+I | Negrito / itálico |
| Ctrl+Shift+X | Tachado |
| Ctrl+E | Código |
| Ctrl+K | Link |
| Ctrl+S | Salvar o arquivo `.md` |
| Tab / Shift+Tab | Indentar / desindentar |
| Enter | Continuar a lista (em item vazio, encerra) |
| Esc e depois Tab | Sair do editor pelo teclado |

No Mac, use Cmd no lugar de Ctrl.

3. Para gerar um PDF, clique em **Imprimir ou PDF** e escolha "Salvar como PDF". Só o documento é impresso, sem os botões.

Um exemplo do que o parser faz com uma lista de tarefas:

```markdown
- [x] Escrever o rascunho
- [ ] Revisar
```

```html
<ul>
<li class="task-list-item"><input type="checkbox" checked="" disabled="" /> Escrever o rascunho</li>
<li class="task-list-item"><input type="checkbox" disabled="" /> Revisar</li>
</ul>
```

O parser também pode ser usado sozinho, como módulo ES:

```js
import { markdownToHtml } from './src/markdown.js';

markdownToHtml('# Olá\n\nTexto com **negrito**.');
// '<h1>Olá</h1>\n<p>Texto com <strong>negrito</strong>.</p>\n'

markdownToHtml('<b>oi</b>', { html: 'sanitize' });
// '<p><b>oi</b></p>\n'
```

Opções de `render` e `markdownToHtml`: `html` (`'escape'` ou `'sanitize'`), `headingIds` (ids no estilo do GitHub nos títulos), `idPrefix` e `sourceLines` (atributo `data-line` com a linha de origem). Em `parse`, `gfm: false` desliga as extensões do GitHub.

## Como rodar localmente

Não há build nem dependências. Como a página usa módulos ES, ela precisa ser servida por HTTP:

```bash
python3 -m http.server 8000
```

Depois abra http://localhost:8000.

## Testes

```bash
npm test
```

(equivale a `node --test`; precisa do Node 18 ou mais novo). São mais de 800 casos, organizados por construção:

- `tests/blocks.test.js`: tabulações, quebras temáticas, títulos, código, blocos de HTML, definições de referência, parágrafos e citações;
- `tests/lists.test.js`: itens, listas apertadas e frouxas, aninhamento e tarefas;
- `tests/inline.test.js`: escapes, entidades, código, ênfase (mais de 100 casos de borda), links, imagens, links automáticos e quebras;
- `tests/gfm.test.js`: tabelas, tachado e links automáticos estendidos;
- `tests/security.test.js`: dezenas de tentativas de XSS nos dois modos e um teste aleatório (semente fixa) que monta documentos com pedaços perigosos e confere que toda etiqueta da saída é conhecida e toda URL é segura;
- `tests/robustness.test.js`: entradas patológicas (50 mil colchetes, mil níveis de lista, comentários sem fim) que precisam terminar rápido;
- `tests/editing.test.js` e `tests/export.test.js`: operações do editor e exportação.

Os casos foram escritos com base nos exemplos da especificação CommonMark e do GFM.

## Como funciona

### Fase 1: blocos

O Markdown é lido linha a linha. A cada linha, o parser percorre os **contêineres abertos** (documento, citação, lista, item) do mais externo para o mais interno e pergunta a cada um se a linha continua nele:

- uma citação continua se a linha começa com `>`;
- um item de lista continua se a linha está indentada pelo menos até o conteúdo do item (a largura do marcador mais os espaços) ou se está em branco;
- um parágrafo continua se a linha não está em branco.

O que sobra da linha pode **abrir blocos novos**, testados na ordem da especificação: citação, título ATX, cerca de código, bloco de HTML, sublinhado setext, tabela, quebra temática, item de lista e código indentado. Se nada abre e o último bloco é um parágrafo, a linha vira **continuação preguiçosa** (é por isso que `> foo` seguido de `bar` sem o `>` continua dentro da citação).

As tabulações contam como paradas de 4 colunas e podem ser consumidas pela metade: em `-\t\tfoo`, parte da primeira tabulação completa o marcador e o resto vira indentação de código.

Quando um bloco fecha, ele é **finalizado**: parágrafos extraem do começo as definições `[rótulo]: destino "título"`, blocos de código separam a info string, e listas decidem se são **apertadas ou frouxas**. A regra: a lista é frouxa se algum item termina com linha em branco antes do próximo, ou se dentro de um item dois blocos estão separados por linha em branco. Em listas apertadas, os parágrafos saem sem `<p>`.

### Fase 2: inlines

O texto de parágrafos, títulos e células é lido da esquerda para a direita. Sequências de `*`, `_` e `~` viram **delimitadores** numa pilha, cada um marcado como "pode abrir" e "pode fechar" conforme o que está antes e depois (as regras de *left-flanking* e *right-flanking*). Por exemplo, em `foo*bar*` o primeiro `*` pode abrir porque vem antes de uma letra; em `a * b` nenhum dos dois pode, porque estão cercados de espaço. No `_` a regra é mais rígida, para que `snake_case_nome` não vire itálico.

Depois, o algoritmo *process emphasis* percorre os fechadores e procura para trás o abridor compatível mais próximo. Se os dois têm dois ou mais caracteres, sai `<strong>`; senão, `<em>`. A **regra do múltiplo de 3** impede pares estranhos: em `*foo**bar*`, o `**` do meio não fecha o `*` do início, então o resultado é `<em>foo**bar</em>`.

Links usam uma **pilha de colchetes**. Ao achar `]`, o parser olha o `[` mais recente e tenta, nessa ordem: link inline `(destino "título")`, referência completa `[rótulo]`, referência vazia `[]` e atalho. Quando um link é formado, os `[` anteriores são desativados, porque link dentro de link não é permitido (imagem dentro de link é).

Os trechos de código têm precedência sobre tudo: `` `*` `` nunca vira ênfase. Para evitar custo quadrático, o parser lembra quais tamanhos de sequência de crases não têm fechamento.

### Extensões do GitHub

- **Tabela**: quando a linha atual é uma linha delimitadora (`| --- | :-: |`) e a última linha do parágrafo aberto tem o mesmo número de células, o parágrafo vira cabeçalho. Barras escapadas (`\|`) ficam dentro da célula, inclusive em código.
- **Tarefa**: um item cujo primeiro parágrafo começa com `[ ]` ou `[x]` seguido de espaço.
- **Links automáticos**: depois da fase de inlines, os textos são varridos atrás de `www.`, `http://`, `https://` e e-mails. A pontuação final (`.`, `,`, `?`) fica fora do link e parênteses de fechamento só entram se estiverem balanceados, então `(veja www.example.com)` funciona como esperado. Um caractere escapado quebra a detecção: `www\.example.com` continua texto.

### Segurança

Todo texto do usuário passa por escape antes de virar HTML. O HTML escrito no próprio Markdown tem dois destinos possíveis:

- **escapar** (padrão): aparece como texto;
- **subconjunto seguro**: um limpador por lista de permissões reconstrói cada etiqueta do zero, mantendo só nomes e atributos conhecidos. Atributos de evento (`onclick`, `onerror`), `style`, `class` e etiquetas como `script`, `iframe`, `svg`, `style` e `form` nunca passam.

Para URLs (em `href` e `src`), o esquema é verificado depois de decodificar entidades e porcentagens e de remover espaços e caracteres de controle, porque o navegador ignora esses caracteres: `java&#x09;script:` e `java%0Ascript:` são bloqueados. Só passam caminhos relativos, âncoras, `http`, `https`, `mailto`, `tel` e, em imagens, `data:` de bitmap. Links com esquema bloqueado continuam no texto, mas sem `href`.

### Rolagem sincronizada

Cada bloco renderizado leva um atributo `data-line` com a linha de origem. No editor, um elemento invisível com a mesma largura e fonte do textarea mede onde cada linha começa, já contando as quebras automáticas. Com essas duas tabelas, a posição de um painel vira um número de linha fracionário, e a linha vira a posição no outro painel por interpolação entre os blocos vizinhos.

### Desfazer em todas as ações

As ações da barra são funções puras (texto e seleção entram, texto e seleção saem). O editor calcula só o trecho que mudou e aplica a troca com `document.execCommand('insertText')`, que é o jeito de alterar um textarea mantendo o histórico do Ctrl+Z.

### Organização do código

```
src/markdown.js   parser (blocos e inlines), extensões do GFM e renderizador
src/entities.js   tabela de entidades do HTML5
src/sanitize.js   limpeza de HTML e verificação de URLs
src/editing.js    operações puras do editor
src/export.js     CSS do documento e montagem do HTML exportado
src/app.js        interface
```

## Contribuindo

Issues e pull requests são bem-vindos. Se encontrar um Markdown que renderiza diferente do esperado, abra uma issue com o texto de entrada e a saída que você esperava; ele vira um caso de teste.

## Licença

MIT. Veja [LICENSE](LICENSE).
