const { v4: uuidv4 } = require('uuid');

class CreateRefunds {
  async run(_dataSource) {
    const refunds = [
      {
        paymentId: uuidv4(),
        amount: 12.99,
        reason: 'Customer requested return',
        status: 'COMPLETED',
      },
      {
        paymentId: uuidv4(),
        amount: 12.99,
        reason: 'Customer requested return',
        status: 'COMPLETED',
      },
    ];

    return refunds;
  }
}

module.exports = CreateRefunds;