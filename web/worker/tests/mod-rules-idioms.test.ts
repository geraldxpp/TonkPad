// @vitest-environment node
import { describe, expect, it } from "vitest";
import { check } from "./mod-rules-fixtures";

/** rules#9: a phone dying, or dying of laughter, is no crisis. */
describe("idioms are never strong self-harm phrases (rules#9)", () => {
  it.each([
    ["Indonesian", "hp gue mau mati, nanti gue cek lagi chartnya"],
    ["Indonesian", "baterai hp aku mau mati"],
    ["Indonesian", "laptop saya mau mati, besok aja"],
    ["Indonesian", "@TonkfunBot hp gue mau mati, fee launch berapa?"],
    ["Indonesian", "sinyal gw mau mati nih"],
    ["Spanish", "quiero morir de risa"],
    ["French", "je veux mourir de rire"],
    ["German", "ich will sterben vor lachen"],
    ["Russian", "хочу умереть от смеха"],
    ["Turkish", "ölmek istiyorum gülmekten"],
    ["Turkish", "gülmekten ölmek istiyorum"],
    ["English", "i want to die laughing"],
    ["English", "I'm killing myself laughing at this chart"],
    ["Portuguese", "quero morrer de rir com esse gráfico"],
    ["Chinese", "笑死我了，这个图"],
    ["Japanese", "笑いすぎて死にたい"],
    ["Korean", "웃겨서 죽고 싶다"],
    ["Vietnamese", "điện thoại tôi muốn chết rồi, sạc đã"],
  ])("%s: %s", (_, text) => {
    expect(check(text).markers.crisis).not.toBe("strong");
  });

  it.each([
    ["Indonesian", "aku mau mati"],
    ["Indonesian", "jujur, aku mau mati"],
    ["Indonesian", "capek. gue mau mati"],
    ["Indonesian", "saya ingin bunuh diri"],
    ["Spanish", "quiero morir"],
    ["French", "je veux mourir"],
    ["German", "ich will sterben"],
    ["Russian", "хочу умереть"],
    ["Turkish", "ölmek istiyorum"],
    ["English", "i want to die"],
    ["English", "i want to die lol"],
    ["Japanese", "死にたい"],
    ["Korean", "죽고 싶다"],
    ["Vietnamese", "tôi muốn chết"],
  ])("still strong: %s: %s", (_, text) => {
    expect(check(text).markers.crisis).toBe("strong");
  });
});
