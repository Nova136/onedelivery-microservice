module.exports = (options, webpack) => {
  // Disable ForkTsCheckerWebpackPlugin to avoid OOM in the separate
  // type-checking process during Nest builds (especially for agent apps).
  options.plugins =
    (options.plugins || []).filter(
      (plugin) =>
        plugin &&
        plugin.constructor &&
        plugin.constructor.name !== "ForkTsCheckerWebpackPlugin",
    );

    
  return options;
};

