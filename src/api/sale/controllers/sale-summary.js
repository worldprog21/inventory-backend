"use strict";

/**
 * A controller to handle sales transactions with atomicity
 */
module.exports = {
  async getSummary(ctx) {
    try {
      const { period } = ctx.params; // 'month', 'last-month', 'two-weeks', 'week'

      const now = new Date();
      let startDate, endDate;

      switch (period) {
        case "last-month":
          // Last month
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          endDate = new Date(now.getFullYear(), now.getMonth(), 0);
          break;
        case "month":
          // Current month
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date();
          break;
        case "two-weeks":
          // Last 15 days
          startDate = new Date();
          startDate.setDate(now.getDate() - 15);
          endDate = new Date();
          break;
        case "week":
          // Last week
          startDate = new Date();
          startDate.setDate(now.getDate() - 7);
          endDate = new Date();
          break;
        default:
          return ctx.badRequest("Invalid period specified");
      }

      const startTimestamp = startDate.getTime();
      const endTimestamp = endDate.getTime();
      const formattedStartDate = startDate.toISOString();
      const formattedEndDate = endDate.toISOString();

      // Get a reference to the Strapi database instance
      const db = strapi.db;

      // Find the model UID for the sale content type
      const salesModel = "api::sale.sale";

      // Get the actual table name from the model metadata
      const tableInfo = db.metadata.get(salesModel);
      if (!tableInfo) {
        return ctx.notFound("Sale table not found");
      }

      const tableName = tableInfo.tableName;

      const results = await db
        .connection(tableName)
        .whereBetween("date", [startTimestamp, endTimestamp])
        .select(
          db.connection.raw("COUNT(*) as count"),
          db.connection.raw(`SUM(subtotal) as total_sales`),
          db.connection.raw(`SUM(tax_amount) as total_tax`),
          db.connection.raw(`SUM(discount_amount) as total_discount`),
          db.connection.raw(`SUM(total) as total_revenue`)
        )
        .first();

      // Format summary data
      const summary = {
        period,
        startDate: formattedStartDate,
        endDate: formattedEndDate,
        count: parseInt(results?.count || 0, 10),
        totalSales: parseFloat(results?.total_sales || 0),
        totalTax: parseFloat(results?.total_tax || 0),
        totalDiscount: parseFloat(results?.total_discount || 0),
        totalRevenue: parseFloat(results?.total_revenue || 0),
      };

      return { data: summary };
    } catch (error) {
      console.error("Error in getSummary:", error);
      return ctx.throw(500, "An error occurred while fetching sales data");
    }
  },

  async getAllSummaries(ctx) {
    // Define the periods we want
    const periods = ["month", "last-month", "two-weeks", "week"];
    const summaries = {};

    // For each period, fetch the summary data
    for (const period of periods) {
      // Reuse the context with modified params
      const periodCtx = { ...ctx, params: { period } };
      const result = await this.getSummary(periodCtx);
      summaries[period] = result.data;
    }

    return { data: summaries };
  },

  async getChartsData(ctx) {
    try {
      const now = new Date();
      // Get the first day of the current month
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      // Get the last day of the current month
      const endOfMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );
      // now.getFullYear() → current year (e.g., 2025)
      // now.getMonth() + 1 → next month (e.g., May is 4, so +1 gives 5 → June)
      // 0 → zero-th day of next month = last day of current month
      // 23, 59, 59, 999 → sets the time to 11:59:59.999 PM
      // In JavaScript, new Date(2025, 5, 0) means:
      // "Go to June 0th, 2025", which JavaScript interprets as May 31st, 2025.
      // So this gives you the very end of the current month.

      const sales = await strapi.entityService.findMany("api::sale.sale", {
        filters: {
          date: {
            $gte: startOfMonth.toISOString(),
            $lte: endOfMonth.toISOString(),
          },
        },
        fields: ["date", "total"],
        pagination: { limit: -1 }, // limit: -1 disables pagination
        sort: ["date:asc"],
      });

      ctx.body = sales;
    } catch (error) {
      console.error("Error in getSummary:", error);
      return ctx.throw(500, "An error occurred while fetching sales data");
    }
  },
};
