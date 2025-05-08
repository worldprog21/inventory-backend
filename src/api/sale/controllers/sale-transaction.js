"use strict";

/**
 * A controller to handle sales transactions with atomicity
 */
module.exports = {
  async createSaleTransaction(ctx) {
    try {
      const { data } = ctx.request.body;

      // Use Strapi's transaction API
      const result = await strapi.db.transaction(async ({ trx }) => {
        // 1. Create the sale within the transaction
        const sale = await strapi.entityService.create("api::sale.sale", {
          data: {
            customer_name: data.customer_name,
            invoice_number: data.invoice_number,
            customer_email: data.customer_email,
            customer_phone: data.customer_phone,
            date: data.date,
            notes: data.notes,
            products: data.products.map((item) => ({
              product: item.product,
              quantity: item.quantity,
              price: item.price,
            })),
            subtotal: data.subtotal,
            discount_amount: data.discount_amount,
            tax_amount: data.tax_amount,
            total: data.total,
          },
          // Pass the transaction
          transaction: { trx },
        });

        // 2. Update product stock within the same transaction
        for (const productItem of data.products) {
          try {
            // First try to fetch the product to verify it exists and get current stock
            const product = await strapi.entityService.findOne(
              "api::product.product",
              productItem.product,
              {
                transaction: { trx },
              }
            );

            if (!product) {
              throw new Error(
                `Product with ID ${productItem.product} not found`
              );
            }

            // Calculate new stock
            const updatedStock = product.stock - productItem.quantity;

            // Check if we would go negative
            if (updatedStock < 0) {
              throw new Error(
                `Insufficient stock for product with ID ${productItem.product}`
              );
            }

            // Update the product stock
            await strapi.entityService.update(
              "api::product.product",
              productItem.product,
              {
                data: { stock: updatedStock },
                transaction: { trx },
              }
            );
          } catch (err) {
            console.error(
              `Error processing product ${productItem.product}:`,
              err
            );
            throw err; // Re-throw to ensure transaction rollback
          }
        }

        // Return the created sale
        return sale;
      });

      // Return success response
      return { data: result, meta: { success: true } };
    } catch (error) {
      console.error("Transaction error:", error);
      ctx.throw(500, error.message);
    }
  },
};
