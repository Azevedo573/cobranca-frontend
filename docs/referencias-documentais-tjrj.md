# Referências Documentais do TJRJ

## Objetivo

O detalhe de uma movimentação TJRJ exibe apenas referências documentais presentes no payload oficial já sincronizado. O Luminus não realiza download, espelhamento ou armazenamento do arquivo do tribunal nesta funcionalidade.

## Fontes aceitas

São normalizados identificadores GED de `pseudoDocEletronico`, `codDocAtoAssinadoDig` e dados de `docEletronico`, quando presentes. Identificadores são convertidos em links para o GED oficial; URLs diretas são aceitas exclusivamente com HTTPS e domínio do TJRJ.

## Segurança e auditoria

Links externos, protocolos não HTTPS e identificadores inválidos são descartados. Referências repetidas são exibidas uma única vez. A origem continua preservada em `complementosJson`, que guarda o payload bruto da movimentação sincronizada. A reversão desta entrega não exige migração nem remove o payload original.
