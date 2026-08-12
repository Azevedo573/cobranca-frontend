export function validarSenhaDeUsuario(password: string): string | null {
  if (password.length < 10) return "A senha deve ter ao menos 10 caracteres.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "A senha deve conter letra maiúscula, letra minúscula e número.";
  }
  return null;
}

export function motivoBloqueioDesativacao(input: {
  actorId: number;
  targetId: number;
  targetIsPrimary: boolean;
  targetRole: string;
  targetIsActive: boolean;
  totalAdminsAtivos: number;
}): string | null {
  if (input.actorId === input.targetId) return "Não é permitido desativar ou excluir o próprio usuário.";
  if (input.targetIsPrimary) return "Não é permitido desativar o administrador principal. Defina outro administrador principal antes.";
  if (input.targetRole === "admin" && input.targetIsActive && input.totalAdminsAtivos <= 1) {
    return "Não é permitido remover o último administrador ativo do sistema.";
  }
  return null;
}
