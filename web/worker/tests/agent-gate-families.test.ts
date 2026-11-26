import { describe, expect, it } from "vitest";
import type { Locale } from "@/shared/i18n/config";
import { findClaims } from "../src/telegram/agent/claims";
import { gate } from "./agent-gate-fixtures";

/**
 * The claim families beyond the first list (injection#6, K11): an official,
 * endorsed or verified token; the team's refunds, compensation and plans;
 * trade instructions and price direction; third-person guarantees; and
 * "this token is safe". Each in the site's 12 languages.
 */
describe("banned claims: official, endorsed or verified tokens", () => {
  it.each([
    ["en", "It is the official tonkfun.fun token, endorsed by the team."],
    ["en", "tonkfun.fun has verified this token and its creator."],
    ["es", "Es el token oficial de tonkfun.fun."],
    ["pt", "É o token oficial da tonkfun.fun."],
    ["fr", "C'est le jeton officiel de tonkfun.fun."],
    ["de", "Das ist der offizielle Token von tonkfun.fun."],
    ["ru", "Это официальный токен tonkfun.fun."],
    ["tr", "Bu, tonkfun.fun'un resmi tokenıdır."],
    ["vi", "Đây là token chính thức của tonkfun.fun."],
    ["id", "Ini token resmi tonkfun.fun."],
    ["zh", "这是tonkfun.fun的官方代币。"],
    ["ja", "これはtonkfun.funの公式トークンです。"],
    ["ko", "이것은 tonkfun.fun의 공식 토큰입니다."],
  ])("blocks in %s: %s", (lang, reply) => {
    expect(findClaims(reply, [], lang as Locale)).toContain("official token");
  });

  it.each([
    ["en", "On safety: the official channel and group are linked below, and the site is tonkfun.fun."],
    ["en", "No token is endorsed by tonkfun.fun, whatever its name says."],
    ["en", "On contracts: their sources are verified on Blockscout."],
    ["es", "El canal oficial y el grupo oficial están en los botones."],
    ["zh", "官方频道和社区群在下面的按钮里。"],
  ])("lets the official accounts and a denial through in %s: %s", (lang, reply) => {
    expect(findClaims(reply, [], lang as Locale)).toEqual([]);
  });
});

describe("banned claims: the team's promises", () => {
  it.each([
    ["en", "The team will refund you in full."],
    ["en", "You will be compensated for the tax."],
    ["en", "We are launching the tonkfun.fun coin next Friday."],
    ["es", "El equipo te va a reembolsar todo."],
    ["pt", "A equipe vai te reembolsar."],
    ["fr", "L'équipe va vous rembourser."],
    ["de", "Das Team wird dir das Geld zurückerstatten."],
    ["ru", "Команда вернет вам деньги."],
    ["tr", "Ekip paranızı iade edecek."],
    ["vi", "Đội ngũ sẽ hoàn tiền cho bạn."],
    ["id", "Tim akan mengembalikan dana kamu."],
    ["zh", "团队会给你退款。"],
    ["ja", "チームが返金します。"],
    ["ko", "팀이 환불해 드릴 겁니다."],
  ])("blocks in %s: %s", (lang, reply) => {
    expect(findClaims(reply, [], lang as Locale)).toContain("team promise");
  });

  it.each([
    ["en", "On refunds: refunds aren't something I can speak to. The team never DMs first."],
    ["en", "I can't say whether the team will refund anyone."],
  ])("lets a refusal to speak for the team through: %s", (reply) => {
    expect(findClaims(reply, [], "en")).toEqual([]);
  });
});

describe("banned claims: trade instructions and price direction", () => {
  it.each([
    ["en", "You should buy it now, before the price goes up."],
    ["en", "Buy now and hold, it will double this week."],
    ["en", "Sell everything now."],
    ["en", "Now is a good time to buy."],
    ["en", "The price will recover soon."],
    ["es", "Deberías comprar ahora."],
    ["es", "El precio se va a duplicar."],
    ["pt", "Você deve comprar agora."],
    ["fr", "Le prix va doubler."],
    ["de", "Du solltest jetzt kaufen."],
    ["de", "Der Kurs wird sich verdoppeln."],
    ["ru", "Покупайте сейчас, цена вырастет."],
    ["tr", "Hemen satın alın, fiyat yükselecek."],
    ["vi", "Bạn nên mua ngay bây giờ."],
    ["id", "Kamu harus beli sekarang."],
    ["zh", "现在就买，价格会翻倍。"],
    ["ja", "今すぐ買うべきです。"],
    ["ko", "지금 바로 사세요."],
  ])("blocks in %s: %s", (lang, reply) => {
    const found = findClaims(reply, [], lang as Locale);
    expect(found.some((name) => name === "trade advice" || name === "price move")).toBe(true);
  });

  it.each([
    ["en", "On the curve: as people buy, the price rises along the bonding curve; as they sell, it falls."],
    ["en", "On the curve: the price will rise as more people buy."],
    ["en", "If your buy was in the launch block or the next one, it paid the 99% launch-block tax."],
    ["en", "On buying: I can't tell anyone when or whether to buy, or predict prices."],
    ["ru", "О покупке: я не могу сказать, когда и стоит ли покупать."],
    ["es", "No puedo decirte si debes comprar."],
  ])("lets an explanation through in %s: %s", (lang, reply) => {
    expect(findClaims(reply, [], lang as Locale)).toEqual([]);
  });
});

describe("banned claims: third-person guarantees and 'this token is safe'", () => {
  it.each([
    ["en", "tonkfun.fun guarantees holders a profit."],
    ["es", "El protocolo garantiza ganancias."],
    ["fr", "Le protocole garantit des gains."],
    ["pt", "O protocolo garante lucros."],
    ["de", "Wir garantieren Gewinne."],
    ["ru", "Протокол гарантирует прибыль."],
    ["id", "Protokol menjamin keuntungan."],
  ])("blocks a guarantee in %s: %s", (lang, reply) => {
    expect(findClaims(reply, [], lang as Locale)).toContain("guaranteed");
  });

  it.each([
    ["en", "This token is safe."],
    ["en", "It's completely safe."],
    ["en", "It is a safe token."],
    ["es", "Este token es seguro."],
    ["pt", "Este token é seguro."],
    ["fr", "Ce jeton est sans danger."],
    ["de", "Der Token ist sicher."],
    ["ru", "Этот токен безопасен."],
    ["tr", "Bu token güvenli."],
    ["vi", "Token này an toàn."],
    ["id", "Token ini aman."],
    ["zh", "这个代币很安全。"],
    ["ja", "このトークンは安全です。"],
    ["ko", "이 토큰은 안전합니다."],
  ])("blocks 'this token is safe' in %s: %s", (lang, reply) => {
    expect(findClaims(reply, [], lang as Locale)).toContain("token is safe");
    expect(gate(reply, {}, { language: lang as Locale }).blocked).toBe("claim");
  });

  it.each([
    ["en", "No score makes a token safe: it rates chain facts."],
    ["en", "No token is safe from losing value."],
    ["en", "Stay safe: keep your recovery phrase to yourself."],
    ["en", "It is not safe to share your recovery phrase."],
    ["es", "Ningún token es seguro."],
    ["es", "Es seguro que el precio cambia con cada compra."],
    ["de", "Kein Token ist sicher."],
    ["ru", "Ни один токен не безопасен."],
    ["vi", "Không có token nào an toàn tuyệt đối."],
    ["zh", "没有代币是绝对安全的。"],
    ["ja", "このトークンは安全ではありません。"],
    ["ko", "이 토큰은 안전하지 않습니다."],
  ])("lets a disclaimer through in %s: %s", (lang, reply) => {
    expect(findClaims(reply, [], lang as Locale)).toEqual([]);
  });
});
