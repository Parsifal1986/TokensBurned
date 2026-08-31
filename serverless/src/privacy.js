import { normalizeCardPolicy, refreshUserCard } from "./card.js";
import { HttpError, json, readJson } from "./http.js";

const FIELDS = [
  "public_card",
  "publish_harness",
  "publish_provider",
  "publish_model",
  "publish_heatmap",
  "publish_rank",
];

function requiredBoolean(body, field) {
  if (typeof body[field] !== "boolean") {
    throw new HttpError(400, "invalid_privacy", `${field} must be a boolean.`);
  }
  return Number(body[field]);
}

export function privacyResponse(row, env) {
  const policy = normalizeCardPolicy(row, false);
  return {
    public_card: policy.publicCard,
    publish_harness: policy.harness,
    publish_provider: policy.provider,
    publish_model: policy.model,
    publish_heatmap: policy.heatmap,
    publish_rank: policy.rank,
    card_url: policy.publicCard
      ? `${env.CARD_ORIGIN.replace(/\/$/, "")}/u/${row.public_slug}.svg`
      : null,
  };
}

export async function getPrivacy(env, device) {
  const user = await env.DB.prepare(
    `SELECT public_slug, public_card, publish_harness, publish_provider,
            publish_model, publish_heatmap, publish_rank
       FROM users WHERE id = ?`,
  ).bind(device.user_id).first();
  return json(privacyResponse(user, env));
}

export async function updatePrivacy(request, env, device) {
  const body = await readJson(request, 8 * 1024);
  const values = Object.fromEntries(FIELDS.map((field) => [field, requiredBoolean(body, field)]));
  await env.DB.prepare(
    `UPDATE users SET
       public_card = ?, publish_harness = ?, publish_provider = ?,
       publish_model = ?, publish_heatmap = ?, publish_rank = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(
    ...FIELDS.map((field) => values[field]),
    new Date().toISOString(),
    device.user_id,
  ).run();
  const user = {
    id: device.user_id,
    public_slug: device.public_slug,
    ...values,
  };
  await refreshUserCard(env, user);
  return json(privacyResponse(user, env));
}
