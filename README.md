# Compras · pedidos e ordens de compra

App para celular (instalável, funciona sem internet) usado pelas obras, escritório, comprador e diretoria para pedir material, aprovar, cotar, emitir a ordem de compra (OC) e confirmar o recebimento.

- Os dados ficam numa planilha Google da empresa ("Compras - Pedidos e OC"), não neste repositório.
- `config.js` guarda o endereço da planilha (App da Web do Apps Script, termina em `/exec`).
- Ao mudar qualquer arquivo, aumente `VERSAO` em `sw.js` para os celulares baixarem a versão nova.
- Mesmo padrão visual do app da Oficina.
- Ligado ao app da Oficina (andrepradebon/oficina): a OS pede peças aqui, acompanha a compra e confirma a chegada. A ligação usa o link /exec e a chave da aba Configurações das duas planilhas.
