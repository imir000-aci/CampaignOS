#!/usr/bin/env python3
"""
Seed script for CampaignOS development data.
Generates synthetic data matching the architecture plan (Section Appendix A).
"""
from __future__ import annotations

import os
import sys
import uuid
import random
import hashlib
from datetime import datetime, timedelta, date
from typing import Any

import numpy as np
from faker import Faker
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env.local"), override=False)
load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env.example"), override=False)

fake = Faker()
rng = np.random.default_rng(42)

BANNERS = ["safeway", "albertsons", "vons", "pavilions", "randalls", "toms", "star_market", "acme", "jewel_osco", "shaw", "united", "carrs"]
DIVISIONS = ["northern_california", "southern_california", "midwest", "northeast"]
LOYALTY_TIERS = ["BRONZE", "SILVER", "GOLD", "PLATINUM"]
AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]

ARCHETYPES = [
    {"name": "budget_conscious", "loyalty_tier": "BRONZE", "ltv_mean": 800, "ltv_std": 300, "days_since_purchase_mean": 14, "digital_rate": 0.4},
    {"name": "loyal_platinum", "loyalty_tier": "PLATINUM", "ltv_mean": 8000, "ltv_std": 2000, "days_since_purchase_mean": 3, "digital_rate": 0.95},
    {"name": "weekend_shopper", "loyalty_tier": "SILVER", "ltv_mean": 2500, "ltv_std": 800, "days_since_purchase_mean": 7, "digital_rate": 0.6},
    {"name": "lapsed", "loyalty_tier": "BRONZE", "ltv_mean": 500, "ltv_std": 200, "days_since_purchase_mean": 90, "digital_rate": 0.2},
    {"name": "digital_native", "loyalty_tier": "GOLD", "ltv_mean": 4500, "ltv_std": 1200, "days_since_purchase_mean": 5, "digital_rate": 0.99},
    {"name": "family_shopper", "loyalty_tier": "GOLD", "ltv_mean": 6000, "ltv_std": 1500, "days_since_purchase_mean": 4, "digital_rate": 0.7},
    {"name": "senior", "loyalty_tier": "SILVER", "ltv_mean": 3000, "ltv_std": 1000, "days_since_purchase_mean": 6, "digital_rate": 0.3},
    {"name": "occasional", "loyalty_tier": "BRONZE", "ltv_mean": 400, "ltv_std": 150, "days_since_purchase_mean": 30, "digital_rate": 0.5},
]

CATEGORY_TAXONOMY = {
    "produce": ["fresh_vegetables", "fresh_fruit", "salad_kits", "herbs"],
    "grocery": ["canned_goods", "pasta_rice", "condiments", "snacks", "cereals", "beverages"],
    "dairy": ["milk", "cheese", "yogurt", "butter", "eggs"],
    "meat_seafood": ["beef", "chicken", "pork", "seafood", "deli"],
    "bakery": ["bread", "pastries", "cakes", "bagels"],
    "frozen": ["frozen_meals", "frozen_vegetables", "ice_cream", "frozen_pizza"],
    "hbc": ["vitamins", "personal_care", "household", "baby", "pharmacy_otc"],
    "floral": ["fresh_flowers", "plants", "arrangements"],
}


def connect(url_env: str) -> psycopg2.extensions.connection:
    url = os.environ.get(url_env)
    if not url:
        print(f"  SKIP: {url_env} not set", file=sys.stderr)
        return None
    return psycopg2.connect(url)


def seed_stores(conn) -> list[dict]:
    if conn is None:
        return []
    stores = []
    store_id = 1000
    for div in DIVISIONS:
        for banner in BANNERS[:3]:
            for _ in range(2):
                stores.append({
                    "id": str(store_id),
                    "banner_id": banner,
                    "division_id": div,
                    "name": f"{banner.replace('_', ' ').title()} #{store_id}",
                    "zip_code": fake.zipcode(),
                    "city": fake.city(),
                    "state": fake.state_abbr(),
                })
                store_id += 1
    return stores[:100]


def seed_customers(audience_url: str, stores: list[dict]) -> list[str]:
    conn = connect(audience_url) if audience_url else None
    if conn is None:
        return []

    customer_ids = []
    batch_attrs = []
    now = datetime.utcnow()

    for i in range(50_000):
        arch = ARCHETYPES[i % len(ARCHETYPES)]
        cid = f"cust_{i:06d}"
        customer_ids.append(cid)

        ltv = max(100, int(rng.normal(arch["ltv_mean"], arch["ltv_std"])))
        days_since = max(1, int(rng.exponential(arch["days_since_purchase_mean"])))
        store = random.choice(stores) if stores else {"banner_id": "albertsons", "id": "1001"}

        batch_attrs.append((
            cid,
            arch["loyalty_tier"],
            ltv * 100,
            days_since,
            store["banner_id"],
            random.choice(AGE_BANDS),
            random.random() < 0.45,
            fake.zipcode(),
            random.random() < arch["digital_rate"],
            now,
        ))

    with conn:
        with conn.cursor() as cur:
            execute_values(cur,
                """
                INSERT INTO customer_attributes
                  (customer_id, loyalty_tier, lifetime_value_cents, days_since_last_purchase,
                   preferred_banner_id, age_band, has_children, zip_code, digital_enrolled, updated_at)
                VALUES %s
                ON CONFLICT (customer_id) DO NOTHING
                """,
                batch_attrs, page_size=1000
            )
    conn.close()
    print(f"  Seeded {len(customer_ids)} customers")
    return customer_ids


def seed_products() -> list[dict]:
    products = []
    pid = 1
    for cat, subcats in CATEGORY_TAXONOMY.items():
        cat_weight = {"produce": 0.15, "grocery": 0.40, "dairy": 0.08, "meat_seafood": 0.12,
                      "bakery": 0.05, "frozen": 0.08, "hbc": 0.08, "floral": 0.04}.get(cat, 0.1)
        count = max(1, int(cat_weight * 5000))
        for _ in range(count):
            subcat = random.choice(subcats)
            price = max(99, int(rng.lognormal(mean=3.0, sigma=0.8) * 100))
            products.append({
                "id": f"prod_{pid:05d}",
                "name": f"{fake.word().title()} {subcat.replace('_', ' ').title()}",
                "category": cat,
                "subcategory": subcat,
                "price_cents": price,
                "status": "ACTIVE" if pid <= 4500 else "DISCONTINUED",
                "banner_availability": random.sample(BANNERS, k=random.randint(3, 12)),
            })
            pid += 1
    return products[:5000]


def seed_offers(conn) -> list[str]:
    if conn is None:
        return []
    offer_types = [
        ("PERCENT_OFF", 40), ("DOLLAR_OFF", 25), ("BOGO", 15),
        ("POINTS_MULTIPLIER", 10), ("FREE_ITEM", 10),
    ]
    now = datetime.utcnow()
    rows = []
    offer_ids = []

    for i in range(200):
        otype = rng.choice([t for t, w in offer_types], p=[w / 100 for _, w in offer_types])
        discount = 10 if otype == "PERCENT_OFF" else 200 if otype == "DOLLAR_OFF" else 1
        oid = str(uuid.uuid4())
        offer_ids.append(oid)
        valid_from = now - timedelta(days=random.randint(0, 30))
        valid_until = now + timedelta(days=random.randint(7, 90))
        status = "ACTIVE" if i < 150 else ("EXPIRED" if i < 175 else "DRAFT")
        rows.append((
            oid, f"Offer {i + 1}", otype, status,
            f"Save on your next purchase #{i + 1}",
            discount, None, 3,
            10_000_00, 10_000_00,
            valid_from, valid_until,
            now, now,
        ))

    with conn:
        with conn.cursor() as cur:
            execute_values(cur,
                """
                INSERT INTO offers
                  (id, name, offer_type, status, description, discount_value,
                   min_purchase_cents, max_redemptions_per_customer,
                   budget_total_cents, budget_remaining_cents,
                   valid_from, valid_until, created_at, updated_at)
                VALUES %s ON CONFLICT DO NOTHING
                """,
                rows
            )
    print(f"  Seeded {len(offer_ids)} offers")
    return offer_ids


def seed_bundles(conn, offer_ids: list[str]) -> None:
    if conn is None or not offer_ids:
        return
    now = datetime.utcnow()
    themes = [
        "Summer Grilling Pack", "Back to School Bundle", "Breakfast Starter Kit",
        "Party Essentials", "Healthy Living Pack", "Holiday Feast Bundle",
        "Coffee & Breakfast", "Taco Tuesday Kit", "Pizza Night Bundle",
        "Smoothie & Snacks Pack",
    ]
    bundle_rows = []
    bundle_offer_rows = []
    for i, theme in enumerate(themes):
        bid = str(uuid.uuid4())
        bundle_rows.append((bid, theme, "ACTIVE", f"Everything you need for {theme.lower()}", now, now))
        for j, oid in enumerate(random.sample(offer_ids, k=random.randint(2, 5))):
            bundle_offer_rows.append((str(uuid.uuid4()), bid, oid, j == 0, now, now))

    with conn:
        with conn.cursor() as cur:
            execute_values(cur,
                "INSERT INTO bundles (id, name, status, description, created_at, updated_at) VALUES %s ON CONFLICT DO NOTHING",
                bundle_rows
            )
            execute_values(cur,
                "INSERT INTO bundle_offers (id, bundle_id, offer_id, is_primary, created_at, updated_at) VALUES %s ON CONFLICT DO NOTHING",
                bundle_offer_rows
            )
    print(f"  Seeded {len(bundle_rows)} bundles")


CAMPAIGN_FIXTURES = [
    {"name": "Summer Savings Drive", "status": "ACTIVE", "objective": "CONVERSION"},
    {"name": "Back to School 2026", "status": "PLANNING", "objective": "AWARENESS"},
    {"name": "Weekly Digital Deals", "status": "DRAFT", "objective": "RETENTION"},
    {"name": "Platinum Loyalty Reward", "status": "APPROVED", "objective": "LOYALTY"},
    {"name": "New Store Grand Opening", "status": "COMPLETED", "objective": "AWARENESS"},
    {"name": "Q3 Win-Back Campaign", "status": "PAUSED", "objective": "WINBACK"},
    {"name": "Holiday Feast Promotion", "status": "DRAFT", "objective": "CONVERSION"},
    {"name": "Fresh Produce Festival", "status": "PENDING_APPROVAL", "objective": "CONSIDERATION"},
    {"name": "Digital-Only Flash Sale", "status": "REJECTED", "objective": "CONVERSION"},
    {"name": "Annual Membership Drive", "status": "ARCHIVED", "objective": "LOYALTY"},
]


def seed_campaigns(conn, owner_id: str) -> list[str]:
    if conn is None:
        return []
    now = datetime.utcnow()
    campaign_ids = []
    rows = []
    for f in CAMPAIGN_FIXTURES:
        cid = str(uuid.uuid4())
        campaign_ids.append(cid)
        start = now + timedelta(days=random.randint(-30, 30))
        end = start + timedelta(days=random.randint(14, 90))
        rows.append((
            cid, f["name"], f["status"], f["objective"],
            f"Campaign brief for {f['name']}.",
            start.date(), end.date(),
            random.randint(50_000, 500_000) * 100,
            owner_id, DIVISIONS[0], BANNERS[0],
            now, now,
        ))

    with conn:
        with conn.cursor() as cur:
            execute_values(cur,
                """
                INSERT INTO campaigns
                  (id, name, status, objective, brief_text, start_date, end_date,
                   budget_total_cents, owner_user_id, division_id, banner_id, created_at, updated_at)
                VALUES %s ON CONFLICT DO NOTHING
                """,
                rows
            )
    print(f"  Seeded {len(campaign_ids)} campaigns")
    return campaign_ids


def seed_admin_user(conn) -> str:
    if conn is None:
        return str(uuid.uuid4())
    import hashlib
    uid = str(uuid.uuid4())
    now = datetime.utcnow()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (id, email, name, role, division_ids, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id RETURNING id
                """,
                (uid, "admin@campaignos.dev", "Platform Admin", "ADMIN",
                 '["northern_california","southern_california","midwest","northeast"]',
                 True, now, now)
            )
            result = cur.fetchone()
            if result:
                uid = result[0]
    print(f"  Seeded admin user: admin@campaignos.dev")
    return uid


def main():
    print("CampaignOS seed data generator")
    print("=" * 40)

    print("\n[1/6] Seeding stores...")
    stores = seed_stores(connect("POSTGRES_AUDIENCE_URL"))
    print(f"  Generated {len(stores)} stores in memory")

    print("\n[2/6] Seeding customers (50,000)...")
    customer_ids = seed_customers(os.environ.get("POSTGRES_AUDIENCE_URL"), stores)

    print("\n[3/6] Seeding offers (200)...")
    offer_conn = connect("POSTGRES_OFFER_URL")
    offer_ids = seed_offers(offer_conn)
    if offer_conn:
        offer_conn.close()

    print("\n[4/6] Seeding bundles (10)...")
    bundle_conn = connect("POSTGRES_BUNDLE_URL")
    seed_bundles(bundle_conn, offer_ids)
    if bundle_conn:
        bundle_conn.close()

    print("\n[5/6] Seeding admin user...")
    auth_conn = connect("POSTGRES_AUTH_URL")
    admin_id = seed_admin_user(auth_conn)
    if auth_conn:
        auth_conn.close()

    print("\n[6/6] Seeding campaigns (10)...")
    strategy_conn = connect("POSTGRES_STRATEGY_URL")
    seed_campaigns(strategy_conn, admin_id)
    if strategy_conn:
        strategy_conn.close()

    print("\n✓ Seed complete.")


if __name__ == "__main__":
    main()
