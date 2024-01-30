const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  entry: './src/NetworkTest/index.ts',
  devtool: 'source-map',
  mode: 'production',
  module: {
    rules: [{
      test: /\.tsx?$/,
      use: {
        loader: 'ts-loader',
      },
      exclude: /node_modules/,
    }],
  },
  resolve: {
    extensions: ['.ts', '.js', '.json']
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist/NetworkTest/'),
    libraryTarget: 'module'
  },
  experiments: {
    outputModule: true
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
};