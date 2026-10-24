import { describe, expect, it } from "vitest";
import { formatarEnderecoSacado, validarEnderecoSacadoParaCNAB } from "./endereco-sacado";

describe("endereço do sacado para CNAB", () => {
  it("compõe logradouro, número, complemento e bairro do devedor", () => {
    expect(formatarEnderecoSacado({
      address: "Rua das Flores",
      addressNumber: "123",
      addressComplement: "Apto 45",
      neighborhood: "Centro",
      city: "Rio de Janeiro",
      state: "rj",
      zipCode: "20.000-001",
    })).toEqual({
      endereco: "Rua das Flores, 123, Apto 45, Centro",
      cidade: "Rio de Janeiro",
      uf: "RJ",
      cep: "20000001",
    });
  });

  it("rejeita endereço incompleto em vez de inventar dados bancários", () => {
    const endereco = formatarEnderecoSacado({ address: "Rua sem CEP", city: "Rio", state: "RJ" });
    expect(() => validarEnderecoSacadoParaCNAB(endereco)).toThrow("devedor deve possuir endereço");
  });
});
