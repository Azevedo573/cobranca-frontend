# Segurança da Gestão de Usuários

## Controles aplicados

As procedures de criação, edição, desativação e restauração exigem `adminProcedure`. As senhas precisam ter no mínimo dez caracteres, com letra maiúscula, letra minúscula e número. E-mails são normalizados para minúsculas e continuam únicos, inclusive quando pertencem a usuários excluídos logicamente.

## Exclusão lógica e restauração

A desativação define `isDeleted = 1`, `isActive = 0` e remove o status de administrador principal, sem remover o registro ou seus vínculos. Usuários excluídos não aparecem nas listagens padrão e não podem emitir ou manter sessões de login. Um administrador pode restaurar o registro, que retorna como **inativo** e sem privilégio principal; a reativação exige revisão explícita.

## Proteções administrativas

O sistema bloqueia autoexclusão, desativação do administrador principal e remoção do último administrador ativo. A troca de administrador principal exige que o alvo esteja ativo, não esteja excluído e pertença ao condomínio. Criação, alteração, exclusão lógica, restauração e troca de administrador principal possuem auditoria.

## Reversão

Para desfazer uma exclusão lógica, use a ação **Restaurar** na listagem de usuários filtrada por **Excluídos logicamente**. Nenhum `DELETE` físico é usado nesta operação.
