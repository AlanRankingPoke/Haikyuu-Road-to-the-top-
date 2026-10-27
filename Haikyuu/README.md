# Haikyuu!! — Road to the Top | Plugin Owlbear Rodeo v0.2

Plugin estático para GitHub Pages; **não exige terminal nem VS Code** para publicação. É um protótipo, ainda **não validado em uma sala real do Owlbear Rodeo**.

## Novidade: Mira de Saque por Baixo

- Cada quadradinho da grade da cena **deve equivaler a 1,5 m**. Configure isso na grade do Owlbear (recomenda-se 1,5m e tipo SQUARE).
- Ao clicar **Saque → Saque por Baixo** na ficha do personagem, você prepara o sacador.
- Clique na ferramenta **🏐 Haikyuu!!** na barra direita e escolha o modo **Mirar Saque** na barra superior, se ele ainda não estiver ativo. O SDK não oferece `activateTool` por código.
- Ao mover o cursor, uma mira azul de **1,5 × 1,5 m** acompanha o cruzamento **mais próximo das linhas da grade**. Ela cobre metade de quatro células; as quatro células completas possíveis ficam levemente destacadas.
- **Clique uma vez** na quadra adversária. O plugin sorteia com probabilidade igual **uma das quatro células** e move o token da bola para seu **centro**. O sorteio da posição é independente da rolagem do atributo Saque.
- Para que haja quatro destinos possíveis, a mira só é aceita quando as **quatro células** cabem na quadra adversária. Mira inválida não move a bola.
- O movimento calcula a diferença entre o **centro visual** do token bola e o centro escolhido, para não depender do ponto de âncora da imagem.
- Repetir o saque não precisa recolocar a bola manualmente; ela se move novamente desde que a bola esteja marcada, desbloqueada e haja permissão para movimentá-la.
- Uma bola por cena, marcada na camada **MOUNT/Montarias**.

## Calibrando uma quadra (passo obrigatório para mestre)

1. Na sala, configure a grade da cena como **quadrada**, com **cada célula de 1,5 m** e alinhada visualmente ao mapa.
2. Em **Haikyuu!! → Mestre → Calibrar quadra**, clique em **Calibrar quadra**.
3. Na barra de ferramentas do Owlbear, clique na ferramenta **🏐 Haikyuu!!**, e no modo superior **Calibrar Quadra** (se não mudar automaticamente).
4. Clique **dentro** da linha no canto superior esquerdo da quadra; depois no canto inferior direito.
5. O plugin salva os limites na cena e divide ao meio verticalmente para identificar os dois lados e a rede. Cada quadra nova precisa ser calibrada uma vez. Pode recalibrar.
6. Coloque uma imagem de bola na aba **Montarias**, selecione-a e escolha **Definir como bola** (somente mestre).

**Orientação da quadra:** a versão 0.2 considera a quadra deitada horizontalmente, como no mapa de teste, com a rede **vertical** no meio. Quadras rotacionadas não são suportadas ainda. O marcador/cálculo usa dados da grade e da cena, não pixels fixos da imagem.

## Como publicar usando só GitHub

1. Crie um repositório público, por exemplo `haikyuu-road-to-the-top`.
2. Envie **todos os arquivos desta pasta à raiz** do repositório (não enviar apenas o .zip sem extrair).
3. Ative **Settings → Pages → Deploy from a branch → main / (root)**.
4. Aguarde a publicação e adicione ao Owlbear Rodeo o link:
   `https://SEU_USUARIO.github.io/haikyuu-road-to-the-top/manifest.json`
5. Ative também o **Dice+** para os botões de rolagem do d20.
6. Se já usa a v0.1, **substitua os arquivos antigos**, adicione também `serve-tool.js` e `serve-math.mjs` e atualize/recarregue a extensão.

## Recursos preservados da v0.1

- Ao selecionar token `CHARACTER`, ficha popover posicionada à direita, com abas Jogador / Mestre / NPCs.
- Os sete atributos Ataque, Defesa, Passe, Salto, Saque, Levantamento e Bloqueio são editáveis e têm botões `1d20 + valor` via canais de broadcast do Dice+.
- Identificação única da bola no layer MOUNT, via aba Mestre ou menu contextual.
- Estado da ficha salvo como metadados do token; calibração da quadra salva em metadados da cena.

## Dependências e limites

- SDK `@owlbear-rodeo/sdk@3.1.0` carregado por `esm.sh`; requer Internet para a CDN.
- `Dice+` instalado e ativo para rolagens. **A escolha aleatória do quadrado é feita pelo próprio plugin**, não pelo Dice+; Dice+ permanece responsável pelos atributos.
- Mover a bola exige permissões do jogador na cena; se a bola estiver bloqueada, destrave.
- Mira temporária local: só quem mira vê a região de seleção. O destino da bola é compartilhado por todos.
- Não existe ainda teste de sucesso/falha para o saque nem suporte a outros tipos de saque. Isso virá conforme as regras forem definidas.
- Não há garantia de funcionamento real sem testes dentro da sala. O script inclui validação matemática unitária, mas a integração com o ambiente do Owlbear necessita ser testada na sala.

## Estrutura

- `manifest.json`: instalação.
- `background.html`, `background.js`: inicialização, menu contextual e abertura automática da ficha.
- `serve-tool.js`: ferramentas de calibrar e mirar, prévia local, validação de destino, movimento da bola.
- `serve-math.mjs`: geometria independente do Owlbear, fácil de testar.
- `index.html`, `panel.js`, `style.css`: interface da ficha e botões de preparação.
- `icon.svg`: ícone.
