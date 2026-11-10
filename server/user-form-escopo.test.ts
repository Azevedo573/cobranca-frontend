import { describe, expect, it } from "vitest";
import {
  buildCreateUserPayload, buildUpdateUserPayload, canSubmitUserForm, changeUserForm,
  changeUserPrincipal, changeUserRole, changeUserScope, changeUserVinculo,
  createUserFormSession, hasAccessChanges, hydrateUserForm, isScopeEligible,
  requiresGlobalAcknowledgement, userFormInvalidationTargets, userScopeLabel,
  validateUserForm, type UserFormSession, type UserFormSource, type UserRole,
} from "../client/src/lib/user-form-escopo";

const source: UserFormSource = { id: 17, name: "Pessoa sintética", email: "fixture@example.invalid", role: "advogado", escopoCondominios: null, condominioId: 1, isActive: 1 };
const links = [{ condominioId: 1, isActive: 1 }, { condominioId: 2, isActive: 1 }, { condominioId: 3, isActive: 0 }];
const edit = (patch: Partial<UserFormSource> = {}) => hydrateUserForm(createUserFormSession(17), { ...source, ...patch }, links);
const confirmed = (session: UserFormSession) => ({ ...session, globalAcknowledged: true, accessConfirmed: true });
const fresh = (role: UserRole) => changeUserForm(changeUserRole(createUserFormSession(null), role), { name: source.name!, email: source.email!, password: "FixturePass123" });
const submitOptions = { pending: false, loading: false, error: false, actorIsAdmin: true };

describe("user form: hydration and draft ownership", () => {
  it("waits for links when user arrives first", () => {
    const initial = createUserFormSession(17);
    expect(hydrateUserForm(initial, source, undefined)).toBe(initial);
    expect(hydrateUserForm(initial, source, links).hydrated).toBe(true);
  });
  it("waits for user when links arrive first", () => {
    const initial = createUserFormSession(17);
    expect(hydrateUserForm(initial, undefined, links)).toBe(initial);
    expect(hydrateUserForm(initial, source, links).data.condominioIds).toEqual(["1", "2"]);
  });
  it("does not fall back to principal for an authoritative empty links response", () => {
    expect(hydrateUserForm(createUserFormSession(17), source, []).data.condominioIds).toEqual([]);
  });
  it("preserves dirty fields written before hydration", () => {
    const initial = changeUserForm(createUserFormSession(17), { name: "Rascunho", password: "DraftPass123" });
    const hydrated = hydrateUserForm(initial, source, links);
    expect(hydrated.data.name).toBe("Rascunho");
    expect(hydrated.data.password).toBe("DraftPass123");
    expect(hydrated.baseline?.name).toBe(source.name);
    expect(hydrated.data.condominioIds).toEqual(["1", "2"]);
  });
  it("does not clobber any dirty field on a refetch", () => {
    const draft = changeUserForm(edit(), { name: "Rascunho", email: "draft@example.invalid", password: "DraftPass123" });
    expect(hydrateUserForm(draft, { ...source, name: "Resposta tardia" }, [])).toBe(draft);
  });
  it("rejects an out of order user response after navigation", () => {
    const other = createUserFormSession(18);
    expect(hydrateUserForm(other, source, links)).toBe(other);
    expect(createUserFormSession(null).dirty).toEqual({});
  });
  it("blocks submit until both queries hydrate", () => {
    expect(canSubmitUserForm(createUserFormSession(17), submitOptions)).toBe(false);
    expect(canSubmitUserForm(edit(), submitOptions)).toBe(true);
  });
  it.each(["pending", "loading", "error"] as const)("blocks submit on %s", flag => {
    expect(canSubmitUserForm(edit(), { ...submitOptions, [flag]: true })).toBe(false);
  });
  it("blocks submit for a non-administrator", () => {
    expect(canSubmitUserForm(fresh("advogado"), { ...submitOptions, actorIsAdmin: false })).toBe(false);
  });
});

describe("user form: legacy preservation and differential payload", () => {
  it("omits every unchanged field, including role, null scope and password", () => {
    expect(buildUpdateUserPayload(edit())).toEqual({});
  });
  it("changes only the name on legacy users, even with no authorized links", () => {
    const legacy = hydrateUserForm(createUserFormSession(17), source, []);
    const draft = changeUserForm(legacy, { name: "Nome novo" });
    expect(buildUpdateUserPayload(draft)).toEqual({ name: "Nome novo" });
    expect(validateUserForm(draft, [])).toBeNull();
    expect(hasAccessChanges(draft)).toBe(false);
  });
  it("changes only password and does not reclassify legacy", () => {
    const draft = changeUserForm(edit(), { password: "AnotherPass123" });
    expect(buildUpdateUserPayload(draft)).toEqual({ password: "AnotherPass123" });
  });
  it("omits a blank or whitespace-only unused password", () => {
    expect(buildUpdateUserPayload(changeUserForm(edit(), { password: "   " }))).toEqual({});
    expect(validateUserForm(changeUserForm(edit(), { password: "   " }), [1, 2])).toBeNull();
  });
  it("changes only email and status without sending access", () => {
    expect(buildUpdateUserPayload(changeUserForm(edit(), { email: "new@example.invalid", isActive: 0 }))).toEqual({ email: "new@example.invalid", isActive: 0 });
  });
  it("treats missing projection scope as legacy, never global", () => {
    const { escopoCondominios: omitted, ...projection } = source;
    const hydrated = hydrateUserForm(createUserFormSession(17), projection, links);
    expect(hydrated.data.escopoCondominios).toBeNull();
    expect(buildUpdateUserPayload(hydrated)).not.toHaveProperty("escopoCondominios");
  });
  it("ignores list ordering and reverted edits for payload and confirmation", () => {
    const draft = changeUserForm(edit(), { condominioIds: ["2", "1"], name: source.name! });
    expect(hasAccessChanges(draft)).toBe(false);
    expect(buildUpdateUserPayload(draft)).toEqual({});
  });
  it("never substitutes a new scope for a dirty legacy name during late hydration", () => {
    const draft = changeUserForm(createUserFormSession(17), { name: "Novo nome" });
    const hydrated = hydrateUserForm(draft, source, links);
    expect(buildUpdateUserPayload(hydrated)).toEqual({ name: "Novo nome" });
  });
});

describe("user form: eligible global scope is not RBAC", () => {
  it.each(["advogado", "colaborador"] as const)("offers recommended global for new %s, requiring acknowledgement", role => {
    const draft = fresh(role);
    expect(isScopeEligible(role)).toBe(true);
    expect(draft.data.escopoCondominios).toBe("todos");
    expect(requiresGlobalAcknowledgement(draft)).toBe(true);
    expect(validateUserForm(draft, [])).toMatch(/ciente/);
    expect(validateUserForm(confirmed(draft), [])).toBeNull();
    expect(buildCreateUserPayload(confirmed(draft))).toMatchObject({ role, escopoCondominios: "todos", condominioIds: [], condominioId: null });
    expect(buildCreateUserPayload(confirmed(draft))).not.toHaveProperty("profileId");
  });
  it.each(["admin", "sindico", "cobrador"] as const)("never offers or sends professional scope to %s", role => {
    const draft = fresh(role);
    expect(isScopeEligible(role)).toBe(false);
    expect(changeUserScope(draft, "todos")).toBe(draft);
    expect(buildCreateUserPayload(draft)).not.toHaveProperty("escopoCondominios");
  });
  it("keeps admin global without requiring a list", () => {
    expect(validateUserForm(fresh("admin"), [])).toBeNull();
    expect(userScopeLabel("admin", null)).toBe("Global administrativo");
  });
  it("allows a global principal outside the individual list without adding a link", () => {
    const draft = confirmed(changeUserPrincipal(fresh("advogado"), "2"));
    expect(draft.data.condominioIds).toEqual([]);
    expect(validateUserForm(draft, [2])).toBeNull();
    expect(buildCreateUserPayload(draft).condominioId).toBe(2);
  });
  it("rejects a global inactive principal when changed", () => {
    expect(validateUserForm(confirmed(changeUserPrincipal(fresh("advogado"), "3")), [1, 2])).toMatch(/principal ativo/);
  });
  it("does not require acknowledgement for unchanged persisted global", () => {
    const draft = changeUserForm(edit({ escopoCondominios: "todos", condominioId: null }), { name: "Novo nome" });
    expect(requiresGlobalAcknowledgement(draft)).toBe(false);
    expect(validateUserForm(draft, [])).toBeNull();
    expect(buildUpdateUserPayload(draft)).toEqual({ name: "Novo nome" });
  });
  it("requires administrative confirmation to grant global to a legacy user", () => {
    const draft = changeUserScope(edit(), "todos");
    expect(validateUserForm({ ...draft, globalAcknowledged: true }, [1, 2])).toMatch(/administrativamente/);
    expect(buildUpdateUserPayload(confirmed(draft))).toEqual({ escopoCondominios: "todos", condominioIds: [], condominioId: null });
  });
  it("resets confirmations after another access edit but not after a personal edit", () => {
    const draft = confirmed(changeUserScope(edit(), "todos"));
    expect(changeUserForm(draft, { name: "Outro nome" }).globalAcknowledged).toBe(true);
    expect(changeUserPrincipal(draft, "2").globalAcknowledged).toBe(false);
    expect(changeUserPrincipal(draft, "2").accessConfirmed).toBe(false);
  });
  it("rejects mixed global and nonempty individual links", () => {
    expect(validateUserForm(confirmed(changeUserForm(fresh("advogado"), { condominioIds: ["1"] })), [1])).toMatch(/vínculos individuais/);
  });
  it("shows global badge, not no condominium, and distinguishes selected/legacy", () => {
    expect(userScopeLabel("advogado", "todos")).toMatch(/Todos os ativos/);
    expect(userScopeLabel("colaborador", "selecionados")).toBe("Selecionados");
    expect(userScopeLabel("advogado", null)).toMatch(/Legado/);
  });
});

describe("user form: selected validation, principal and role transitions", () => {
  it("does not equate empty selection to global", () => {
    const selected = confirmed(changeUserScope(fresh("advogado"), "selecionados"));
    expect(validateUserForm(selected, [1])).toMatch(/ao menos um/);
  });
  it.each(["advogado", "colaborador", "sindico", "cobrador"] as const)("requires an active selected list for %s", role => {
    const initial = fresh(role);
    const draft = isScopeEligible(role) ? changeUserScope(initial, "selecionados") : initial;
    expect(validateUserForm(confirmed(draft), [1])).toMatch(/ao menos um/);
    expect(validateUserForm(confirmed(changeUserVinculo(draft, "1", true)), [1])).toBeNull();
  });
  it("requires a valid selected list and visible confirmation for global to selected", () => {
    const global = hydrateUserForm(createUserFormSession(17), { ...source, escopoCondominios: "todos", condominioId: null }, []);
    const selected = changeUserScope(global, "selecionados");
    expect(validateUserForm(confirmed(selected), [1, 2])).toMatch(/ao menos um/);
    const linked = changeUserVinculo(selected, "1", true);
    expect(validateUserForm(linked, [1, 2])).toMatch(/administrativamente/);
    expect(validateUserForm(confirmed(linked), [1, 2])).toBeNull();
    expect(buildUpdateUserPayload(confirmed(linked))).toEqual({ escopoCondominios: "selecionados", condominioIds: [1] });
  });
  it("adds a selected principal to the authorized list", () => {
    const selected = changeUserScope(fresh("advogado"), "selecionados");
    const draft = confirmed(changeUserPrincipal(selected, "2"));
    expect(draft.data.condominioIds).toEqual(["2"]);
    expect(validateUserForm(draft, [2])).toBeNull();
  });
  it("uses first authorized ID for a new selected user without principal preference", () => {
    const selected = confirmed(changeUserVinculo(changeUserScope(fresh("advogado"), "selecionados"), "2", true));
    expect(selected.data.condominioId).toBe("");
    expect(buildCreateUserPayload(selected)).toMatchObject({ escopoCondominios: "selecionados", condominioIds: [2], condominioId: 2 });
  });
  it("marks principal changes on eligible legacy as explicitly selected", () => {
    const draft = changeUserPrincipal(edit(), "2");
    expect(buildUpdateUserPayload(draft)).toMatchObject({ escopoCondominios: "selecionados", condominioId: 2, condominioIds: [1, 2] });
    expect(validateUserForm(draft, [1, 2])).toMatch(/administrativamente/);
  });
  it("rejects a principal outside selected IDs", () => {
    const draft = confirmed(changeUserForm(edit({ escopoCondominios: "selecionados" }), { condominioId: "3" }));
    expect(validateUserForm(draft, [1, 2, 3])).toMatch(/principal deve constar/);
  });
  it("rejects inactive IDs and duplicate IDs", () => {
    const selected = changeUserScope(fresh("advogado"), "selecionados");
    expect(validateUserForm(confirmed(changeUserForm(selected, { condominioIds: ["3"] })), [1, 2])).toMatch(/ativos e válidos/);
    expect(validateUserForm(confirmed(changeUserForm(selected, { condominioIds: ["1", "1"] })), [1])).toMatch(/repita/);
  });
  it("removing the principal clears only the preference, not another authorization", () => {
    const draft = confirmed(changeUserVinculo(edit({ escopoCondominios: "selecionados" }), "1", false));
    expect(draft.data.condominioId).toBe("");
    expect(buildUpdateUserPayload(draft)).toEqual({ condominioIds: [2], condominioId: 2 });
    expect(validateUserForm(draft, [2])).toBeNull();
  });
  it("changing legacy IDs chooses selected explicitly and requires confirmation", () => {
    const draft = changeUserVinculo(edit(), "2", false);
    expect(buildUpdateUserPayload(draft)).toEqual({ escopoCondominios: "selecionados", condominioIds: [1] });
    expect(validateUserForm(draft, [1])).toMatch(/administrativamente/);
  });
  it.each(["sindico", "cobrador"] as const)("global to %s omits scope, requires selected IDs and confirms revocation", role => {
    const global = hydrateUserForm(createUserFormSession(17), { ...source, escopoCondominios: "todos", condominioId: null }, []);
    const changed = changeUserRole(global, role);
    expect(changed.data.escopoCondominios).toBeNull();
    expect(validateUserForm(confirmed(changed), [1])).toMatch(/ao menos um/);
    const linked = confirmed(changeUserVinculo(changed, "1", true));
    expect(buildUpdateUserPayload(linked)).toEqual({ role, condominioIds: [1] });
    expect(buildUpdateUserPayload(linked)).not.toHaveProperty("escopoCondominios");
    expect(validateUserForm(linked, [1])).toBeNull();
  });
  it("role transition to admin does not send professional scope", () => {
    const draft = confirmed(changeUserRole(edit({ escopoCondominios: "todos" }), "admin"));
    expect(buildUpdateUserPayload(draft)).toEqual({ role: "admin", condominioIds: [], condominioId: null });
    expect(validateUserForm(draft, [])).toBeNull();
  });
});

describe("user form: targeted cache invalidation", () => {
  it("always refreshes user lists, filtered lists, detail and links", () => {
    expect(userFormInvalidationTargets(false, false)).toEqual(["users.list", "users.listByCondominio", "users.getById", "users.getVinculosCondominios"]);
  });
  it.each([[true, false], [false, true], [true, true]])("refreshes current identity and operational portfolio for access=%s status=%s", (access, status) => {
    expect(userFormInvalidationTargets(access, status)).toContain("auth.me");
    expect(userFormInvalidationTargets(access, status)).toContain("condominios.list");
    expect(userFormInvalidationTargets(access, status)).not.toContain("perfis.list");
  });
});
