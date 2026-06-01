import pdfMake from 'pdfmake/build/pdfmake';
import 'pdfmake/build/vfs_fonts';

/*
type Plan = {
    name: string;
    period: string;
    startDate?: string;
};

type PlanItem = {
    date: string;
    mealTag: string;
    mealName: string;
};

type ShoppingRow = {
    product: string;
    quantity: number;
    unit: string;
    usage: string;
};

function exportPlanPdf({
                                  plan,
                                  items,
                                  shoppingRows,
                              }: {
    plan: Plan;
    items: PlanItem[];
    shoppingRows: ShoppingRow[];
})
*/

function cell(text) {
    return { text, style: 'tableCell' };
}

export function exportPlanPdf({
                                  plan,
                                  items,
                                  shoppingRows,
                              }) {
    const content = [
        { text: `План питания: ${plan.name}`, style: 'title' },
        { text: `Период: ${plan.period}`, style: 'subtitle' },
        { text: '\n' },
        { text: 'Меню', style: 'sectionTitle' },
        {
            table: {
                headerRows: 1,
                widths: ['auto', 'auto', '*'],
                body: [
                    [cell('Дата'), cell('Прием пищи'), cell('Блюдо')],
                    ...items.map((item) => [
                        cell(item.date),
                        cell(item.mealTag),
                        cell(item.mealName),
                    ]),
                ],
            },
            layout: 'lightHorizontalLines',
            margin: [0, 8, 0, 16],
        },
        { text: 'Список покупок', style: 'sectionTitle' },
        {
            table: {
                headerRows: 1,
                widths: ['auto', 'auto', '*'],
                body: [
                    [cell('Продукт'), cell('Количество'), cell('Где нужен')],
                    ...shoppingRows.map((row) => [
                        cell(row.product),
                        cell(`${row.quantity} ${row.unit}`),
                        cell(row.usage),
                    ]),
                ],
            },
            layout: 'lightHorizontalLines',
            margin: [0, 8, 0, 0],
        },
    ];

    const docDefinition = {
        content,
        defaultStyle: {
            fontSize: 10,
        },
        styles: {
            title: {
                fontSize: 18,
                bold: true,
            },
            subtitle: {
                fontSize: 11,
                color: '#666',
            },
            sectionTitle: {
                fontSize: 13,
                bold: true,
                margin: [0, 8, 0, 4],
            },
            tableCell: {
                fontSize: 9,
            },
        },
        pageMargins: [40, 50, 40, 40],
        info: {
            title: plan.name,
            subject: 'План питания',
            author: 'Meal Planner',
        },
    };

    pdfMake.createPdf(docDefinition).download(`${plan.name}.pdf`);
}