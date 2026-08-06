import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  formatCEP,
  formatDocument,
  formatPhone,
  hasErrors,
  isValidCNPJ,
  isValidCPF,
  normalizeEmail,
  slugify,
  validateBrazilianPhone,
  validateCEP,
  validateCompanyStep,
  validateDocument,
  validateEmail,
  validateFullName,
  validateOwnerStep,
  validatePassword,
  validatePasswordConfirmation,
  validateState,
  type CompanyData,
  type OwnerData,
} from "./validation";

const validOwner: OwnerData = {
  fullName: "João da Silva",
  email: "joao@exemplo.com.br",
  whatsapp: "(11) 99999-0000",
  password: "senha1234",
  passwordConfirmation: "senha1234",
};

const validCompany: CompanyData = {
  name: "Pizzaria do João",
  tradeName: "Pizzaria do João",
  document: "",
  phone: "",
  segment: "pizzaria",
  address: "Rua das Flores, 123",
  city: "São Paulo",
  state: "SP",
  zipCode: "",
};

describe("responsável", () => {
  it("normaliza o e-mail antes de validar", () => {
    expect(normalizeEmail("  JOAO@Exemplo.COM  ")).toBe("joao@exemplo.com");
    expect(validateEmail("  JOAO@Exemplo.COM  ").valid).toBe(true);
  });

  it("recusa e-mail malformado", () => {
    for (const value of ["", "joao", "joao@", "@exemplo.com", "joao@exemplo", "a b@c.com"]) {
      expect(validateEmail(value).valid).toBe(false);
    }
  });

  it("exige nome e sobrenome", () => {
    expect(validateFullName("João").valid).toBe(false);
    expect(validateFullName("João da Silva").valid).toBe(true);
    // Espaços repetidos não devem virar "sobrenome".
    expect(validateFullName("João   ").valid).toBe(false);
  });

  it("exige senha com comprimento, letra e número", () => {
    expect(validatePassword("abc123").valid).toBe(false); // curta
    expect(validatePassword("a".repeat(PASSWORD_MIN_LENGTH)).valid).toBe(false); // sem número
    expect(validatePassword("12345678").valid).toBe(false); // sem letra
    expect(validatePassword("senha1234").valid).toBe(true);
  });

  it("detecta confirmação divergente", () => {
    expect(validatePasswordConfirmation("senha1234", "senha1234").valid).toBe(true);
    expect(validatePasswordConfirmation("senha1234", "senha4321").valid).toBe(false);
    expect(validatePasswordConfirmation("senha1234", "").valid).toBe(false);
  });

  it("aponta todos os erros da etapa de uma vez, não só o primeiro", () => {
    const errors = validateOwnerStep({
      fullName: "J",
      email: "invalido",
      whatsapp: "123",
      password: "123",
      passwordConfirmation: "456",
    });
    expect(Object.keys(errors).sort()).toEqual(
      ["email", "fullName", "password", "passwordConfirmation", "whatsapp"].sort(),
    );
  });

  it("aceita a etapa preenchida corretamente", () => {
    expect(hasErrors(validateOwnerStep(validOwner))).toBe(false);
  });
});

describe("telefone brasileiro", () => {
  it("aceita fixo e celular", () => {
    expect(validateBrazilianPhone("(11) 3333-4444").valid).toBe(true);
    expect(validateBrazilianPhone("(11) 99999-0000").valid).toBe(true);
  });

  it("recusa DDD inexistente", () => {
    expect(validateBrazilianPhone("(01) 99999-0000").valid).toBe(false);
    expect(validateBrazilianPhone("(00) 3333-4444").valid).toBe(false);
  });

  it("recusa celular que não começa com 9", () => {
    // Onze dígitos com terceiro diferente de 9 não é celular brasileiro.
    expect(validateBrazilianPhone("11855550000").valid).toBe(false);
  });

  it("recusa quantidade de dígitos incorreta", () => {
    expect(validateBrazilianPhone("119999").valid).toBe(false);
    expect(validateBrazilianPhone("119999900001").valid).toBe(false);
    expect(validateBrazilianPhone("").valid).toBe(false);
  });

  it("formata enquanto o usuário digita", () => {
    expect(formatPhone("11")).toBe("11");
    expect(formatPhone("1133")).toBe("(11) 33");
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
    expect(formatPhone("11999990000")).toBe("(11) 99999-0000");
    // Não deixa passar do tamanho máximo.
    expect(formatPhone("119999900001234")).toBe("(11) 99999-0000");
  });
});

describe("CPF", () => {
  it("valida o dígito verificador, e não só o comprimento", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    // Mesmo CPF com o último dígito trocado.
    expect(isValidCPF("529.982.247-24")).toBe(false);
  });

  it("recusa sequência repetida, que passa no cálculo mas não é válida", () => {
    for (const cpf of ["111.111.111-11", "000.000.000-00", "999.999.999-99"]) {
      expect(isValidCPF(cpf)).toBe(false);
    }
  });

  it("recusa comprimento errado", () => {
    expect(isValidCPF("5299822472")).toBe(false);
    expect(isValidCPF("529982247251")).toBe(false);
  });
});

describe("CNPJ", () => {
  it("valida o dígito verificador", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("11.222.333/0001-82")).toBe(false);
  });

  it("recusa sequência repetida", () => {
    expect(isValidCNPJ("11.111.111/1111-11")).toBe(false);
  });
});

describe("documento do estabelecimento", () => {
  it("é opcional — não barra quem opera como pessoa física", () => {
    expect(validateDocument("").valid).toBe(true);
    expect(validateDocument("   ").valid).toBe(true);
  });

  it("valida de verdade quando informado", () => {
    expect(validateDocument("529.982.247-25").valid).toBe(true);
    expect(validateDocument("11.222.333/0001-81").valid).toBe(true);
    expect(validateDocument("529.982.247-24").valid).toBe(false);
  });

  it("explica quando o comprimento não é nem CPF nem CNPJ", () => {
    const result = validateDocument("12345");
    expect(result.valid).toBe(false);
    expect(result.valid === false && result.message).toMatch(/CPF.*CNPJ/);
  });

  it("formata conforme o comprimento", () => {
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
  });
});

describe("endereço", () => {
  it("aceita CEP vazio e valida quando informado", () => {
    expect(validateCEP("").valid).toBe(true);
    expect(validateCEP("01310-100").valid).toBe(true);
    expect(validateCEP("0131010").valid).toBe(false);
  });

  it("formata o CEP", () => {
    expect(formatCEP("01310100")).toBe("01310-100");
    expect(formatCEP("013")).toBe("013");
  });

  it("valida a sigla do estado", () => {
    expect(validateState("SP").valid).toBe(true);
    expect(validateState("sp").valid).toBe(true);
    expect(validateState("XX").valid).toBe(false);
    expect(validateState("").valid).toBe(true);
  });
});

describe("empresa", () => {
  it("aceita a etapa com os campos mínimos", () => {
    expect(hasErrors(validateCompanyStep(validCompany))).toBe(false);
  });

  it("exige o nome do estabelecimento", () => {
    const errors = validateCompanyStep({ ...validCompany, name: "" });
    expect(errors.name).toBeTruthy();
  });

  it("valida documento e CEP quando preenchidos", () => {
    const errors = validateCompanyStep({
      ...validCompany,
      document: "529.982.247-24",
      zipCode: "123",
    });
    expect(errors.document).toBeTruthy();
    expect(errors.zipCode).toBeTruthy();
  });

  it("gera slug sem acento nem símbolo", () => {
    expect(slugify("Pizzaria do João")).toBe("pizzaria-do-joao");
    expect(slugify("Açaí & Cia.")).toBe("acai-cia");
    expect(slugify("  --Restaurante--  ")).toBe("restaurante");
  });

  it("limita o tamanho do slug", () => {
    expect(slugify("a".repeat(80)).length).toBeLessThanOrEqual(48);
  });
});
