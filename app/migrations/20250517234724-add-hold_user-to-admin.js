module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('admin', 'hold_user', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('admin', 'hold_user');
  }
}; 