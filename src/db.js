import Dexie from 'dexie';

export const db = new Dexie('mealPlannerDB');

db.version(1).stores({
    meals: 'id, name, *tags',
    plans: 'id, name, period, createdAt',
    planItems: 'id, planId, date, mealId, mealName',
    shoppingLists: 'id, planId, createdAt',
    shoppingItems: 'id, shoppingListId, product',
});

export async function seedIfEmpty() {
    const count = await db.meals.count();
    if (count > 0) return;

    await db.meals.bulkAdd([
        {
            id: crypto.randomUUID(),
            name: 'Овсянка с бананом',
            description: 'Овсянка, банан, молоко, мед',
            tags: ['breakfast'],
            ingredients: [
                { product: 'Овсянка', quantity: 80, unit: 'г' },
                { product: 'Банан', quantity: 1, unit: 'шт' },
                { product: 'Молоко', quantity: 250, unit: 'мл' },
            ],
        },
        {
            id: crypto.randomUUID(),
            name: 'Курица с рисом',
            description: 'Куриная грудка, рис, овощи',
            tags: ['dinner', 'lunch'],
            ingredients: [
                { product: 'Куриная грудка', quantity: 200, unit: 'г' },
                { product: 'Рис', quantity: 100, unit: 'г' },
                { product: 'Овощи', quantity: 150, unit: 'г' },
            ],
        },
    ]);
}