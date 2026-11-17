/*
 * 有機反応マップ（app11）— 通常配置案（normal-proposed）データ
 *
 * このファイルは scripts/app11/build-proposed-layout.cjs が生成する。直接編集しない。
 * 正本は scripts/app11/proposed-network-layout.cjs（決定的な geometry generator）。
 * 通常 427 物質・162 反応・375 辺の座標だけを持ち、化学的な内容（facts / equation /
 * sources など）は data.js（D）をそのまま使う。base のハッシュで D との一致を検証する。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPMapLayoutProposal = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {
 "version": 1,
 "kind": "normal-proposed",
 "base": {
  "normalVersion": "2026-11-14.3",
  "compoundCount": 427,
  "reactionCount": 162,
  "reactionHash": "d437498e",
  "nodeIdHash": "22c4632a",
  "classMapHash": "e3795071"
 },
 "positions": {
  "1,1,2,2-tetrabromoethane": {
   "x": 1040.34,
   "y": 1136.84,
   "w": 136,
   "h": 34
  },
  "1,2-dibromoethane": {
   "x": 1605.6,
   "y": 585.5,
   "w": 136,
   "h": 34
  },
  "1,2-dibromoethene": {
   "x": 1328.81,
   "y": 826.7,
   "w": 136,
   "h": 34
  },
  "2-chloro-2-methylpropane": {
   "x": 2331.75,
   "y": 2614.35,
   "w": 136,
   "h": 34
  },
  "bromoethane": {
   "x": 1832.06,
   "y": 575.51,
   "w": 136,
   "h": 34
  },
  "bromoethene": {
   "x": 1956.77,
   "y": 731.49,
   "w": 136,
   "h": 34
  },
  "chloromethane": {
   "x": 1996.16,
   "y": 545.09,
   "w": 136,
   "h": 34
  },
  "copper-i-acetylide": {
   "x": 2504.65,
   "y": 722.76,
   "w": 136,
   "h": 34
  },
  "cyclohexane": {
   "x": 2244.85,
   "y": 849.89,
   "w": 136,
   "h": 34
  },
  "ethane": {
   "x": 2552.34,
   "y": 908.68,
   "w": 136,
   "h": 34
  },
  "ethene": {
   "x": 2029.7,
   "y": 874.71,
   "w": 176,
   "h": 34
  },
  "ethyne": {
   "x": 2322.39,
   "y": 1218.86,
   "w": 136,
   "h": 34
  },
  "hexachlorocyclohexane": {
   "x": 2727.82,
   "y": 912.94,
   "w": 136,
   "h": 34
  },
  "iodoform": {
   "x": 1257.63,
   "y": 1202.59,
   "w": 136,
   "h": 34
  },
  "isobutene": {
   "x": 1168.11,
   "y": 2583.68,
   "w": 136,
   "h": 34
  },
  "methane": {
   "x": 1346.84,
   "y": 1009.71,
   "w": 136,
   "h": 34
  },
  "propane": {
   "x": 1164.71,
   "y": 859.87,
   "w": 136,
   "h": 34
  },
  "propene": {
   "x": 1804.31,
   "y": 877.12,
   "w": 136,
   "h": 34
  },
  "propyne": {
   "x": 2080.83,
   "y": 812.85,
   "w": 136,
   "h": 34
  },
  "silver-acetylide": {
   "x": 2266.33,
   "y": 673.12,
   "w": 136,
   "h": 34
  },
  "benzene": {
   "x": 1879.82,
   "y": 1338.2,
   "w": 136,
   "h": 34
  },
  "cumene": {
   "x": 1985.41,
   "y": 1166.3,
   "w": 136,
   "h": 34
  },
  "ethylbenzene": {
   "x": 2120.14,
   "y": 2740.39,
   "w": 136,
   "h": 34
  },
  "o-xylene": {
   "x": 2487.42,
   "y": 1215.23,
   "w": 136,
   "h": 34
  },
  "p-xylene": {
   "x": 2272.73,
   "y": 2802.18,
   "w": 136,
   "h": 34
  },
  "styrene": {
   "x": 2495.86,
   "y": 2707.12,
   "w": 136,
   "h": 34
  },
  "toluene": {
   "x": 3015.39,
   "y": 2689.59,
   "w": 136,
   "h": 34
  },
  "2-methylpropan-2-ol": {
   "x": 1474.25,
   "y": 2650.64,
   "w": 136,
   "h": 34
  },
  "3-methylbutan-1-ol": {
   "x": 2610.55,
   "y": 1373.24,
   "w": 136,
   "h": 34
  },
  "butan-1-ol": {
   "x": 2866.47,
   "y": 1245.96,
   "w": 136,
   "h": 34
  },
  "diethyl-ether": {
   "x": 2789.92,
   "y": 1081.06,
   "w": 136,
   "h": 34
  },
  "ethanol": {
   "x": 1639.72,
   "y": 1349.51,
   "w": 212,
   "h": 34
  },
  "ethylene-glycol": {
   "x": 2456.35,
   "y": 3125.1,
   "w": 136,
   "h": 34
  },
  "glycerol": {
   "x": 1583.43,
   "y": 1929.98,
   "w": 212,
   "h": 34
  },
  "methanol": {
   "x": 1370.12,
   "y": 1583.26,
   "w": 194,
   "h": 34
  },
  "propan-1-ol": {
   "x": 1451.83,
   "y": 947.61,
   "w": 136,
   "h": 34
  },
  "propan-2-ol": {
   "x": 1727.75,
   "y": 1411.55,
   "w": 136,
   "h": 34
  },
  "sodium-ethoxide": {
   "x": 1535.88,
   "y": 824.18,
   "w": 136,
   "h": 34
  },
  "sodium-methoxide": {
   "x": 1790.58,
   "y": 731.48,
   "w": 136,
   "h": 34
  },
  "acetic-acid": {
   "x": 2119.9,
   "y": 1441.38,
   "w": 212,
   "h": 34
  },
  "acetic-anhydride": {
   "x": 2544.34,
   "y": 1519.31,
   "w": 136,
   "h": 34
  },
  "acetone": {
   "x": 2119.91,
   "y": 1383.18,
   "w": 176,
   "h": 34
  },
  "adipic-acid": {
   "x": 1588.64,
   "y": 2566.63,
   "w": 136,
   "h": 34
  },
  "adipoyl-chloride": {
   "x": 1529.94,
   "y": 2937.29,
   "w": 136,
   "h": 34
  },
  "benzoic-acid": {
   "x": 2979.68,
   "y": 2340.88,
   "w": 136,
   "h": 34
  },
  "butanal": {
   "x": 3042.91,
   "y": 1364.08,
   "w": 136,
   "h": 34
  },
  "butanoic-acid": {
   "x": 3164.25,
   "y": 1544.74,
   "w": 136,
   "h": 34
  },
  "ethanal": {
   "x": 1678.61,
   "y": 1192.26,
   "w": 136,
   "h": 34
  },
  "formaldehyde": {
   "x": 1217.54,
   "y": 1959.48,
   "w": 136,
   "h": 34
  },
  "formic-acid": {
   "x": 992.17,
   "y": 1558.83,
   "w": 136,
   "h": 34
  },
  "maleic-acid": {
   "x": 1847.97,
   "y": 3378.49,
   "w": 136,
   "h": 34
  },
  "maleic-anhydride": {
   "x": 2029.02,
   "y": 3481.13,
   "w": 136,
   "h": 34
  },
  "oxalic-acid": {
   "x": 1545.66,
   "y": 1645.36,
   "w": 136,
   "h": 34
  },
  "phthalic-anhydride": {
   "x": 2066.85,
   "y": 1771.61,
   "w": 136,
   "h": 34
  },
  "propanal": {
   "x": 1690.97,
   "y": 1117.53,
   "w": 136,
   "h": 34
  },
  "propionic-acid": {
   "x": 1523.71,
   "y": 1411.55,
   "w": 176,
   "h": 34
  },
  "sodium-acetate": {
   "x": 2166.18,
   "y": 1511.79,
   "w": 136,
   "h": 34
  },
  "sodium-benzoate": {
   "x": 3185.92,
   "y": 2146.79,
   "w": 136,
   "h": 34
  },
  "butyl-acetate": {
   "x": 2731.58,
   "y": 1308.06,
   "w": 136,
   "h": 34
  },
  "dimethyl-oxalate": {
   "x": 2506.26,
   "y": 1311.21,
   "w": 136,
   "h": 34
  },
  "ethyl-acetate": {
   "x": 2197.83,
   "y": 1319.27,
   "w": 136,
   "h": 34
  },
  "ethyl-butyrate": {
   "x": 3133.22,
   "y": 1753.85,
   "w": 136,
   "h": 34
  },
  "ethyl-formate": {
   "x": 848.28,
   "y": 1432.82,
   "w": 136,
   "h": 34
  },
  "ethyl-propionate": {
   "x": 1195.17,
   "y": 1385.93,
   "w": 136,
   "h": 34
  },
  "isoamyl-acetate": {
   "x": 1101.09,
   "y": 2051.75,
   "w": 136,
   "h": 34
  },
  "linoleic-acid": {
   "x": 1112.64,
   "y": 1805.79,
   "w": 136,
   "h": 34
  },
  "methyl-acetate": {
   "x": 1703.89,
   "y": 1867.88,
   "w": 136,
   "h": 34
  },
  "methyl-formate": {
   "x": 1310.28,
   "y": 1521.25,
   "w": 136,
   "h": 34
  },
  "methyl-propionate": {
   "x": 1746.16,
   "y": 1559.67,
   "w": 136,
   "h": 34
  },
  "methyl-salicylate": {
   "x": 2418.15,
   "y": 1727.38,
   "w": 136,
   "h": 34
  },
  "oleic-acid": {
   "x": 2639.93,
   "y": 1756.05,
   "w": 136,
   "h": 34
  },
  "palmitic-acid": {
   "x": 2067.31,
   "y": 1709.58,
   "w": 136,
   "h": 34
  },
  "phenyl-acetate": {
   "x": 2954.33,
   "y": 1761.81,
   "w": 136,
   "h": 34
  },
  "sodium-oleate": {
   "x": 2960.27,
   "y": 1922.42,
   "w": 136,
   "h": 34
  },
  "sodium-palmitate": {
   "x": 966.17,
   "y": 1743.69,
   "w": 136,
   "h": 34
  },
  "sodium-stearate": {
   "x": 1342.29,
   "y": 2378.17,
   "w": 136,
   "h": 34
  },
  "stearic-acid": {
   "x": 1222.91,
   "y": 2119.36,
   "w": 136,
   "h": 34
  },
  "triacetin": {
   "x": 1530.38,
   "y": 1853.39,
   "w": 136,
   "h": 34
  },
  "trilinolein": {
   "x": 1326.08,
   "y": 2057.26,
   "w": 136,
   "h": 34
  },
  "triolein": {
   "x": 2069.13,
   "y": 2089.16,
   "w": 136,
   "h": 34
  },
  "tripalmitin": {
   "x": 1632.73,
   "y": 1791.37,
   "w": 136,
   "h": 34
  },
  "tristearin": {
   "x": 1630.19,
   "y": 2125.21,
   "w": 176,
   "h": 34
  },
  "2,4,6-tribromophenol": {
   "x": 2508.4,
   "y": 2100.28,
   "w": 136,
   "h": 34
  },
  "acetanilide": {
   "x": 2725.43,
   "y": 1445.25,
   "w": 136,
   "h": 34
  },
  "aspirin": {
   "x": 2828.5,
   "y": 1686.05,
   "w": 136,
   "h": 34
  },
  "benzaldehyde": {
   "x": 1409.56,
   "y": 2720.51,
   "w": 136,
   "h": 34
  },
  "benzenediazonium-chloride": {
   "x": 2582.46,
   "y": 1914.12,
   "w": 136,
   "h": 34
  },
  "benzenesulfonic-acid": {
   "x": 1193.58,
   "y": 1867.84,
   "w": 136,
   "h": 34
  },
  "benzyl-alcohol": {
   "x": 953.35,
   "y": 2632.77,
   "w": 136,
   "h": 34
  },
  "chlorobenzene": {
   "x": 1755.75,
   "y": 2063.23,
   "w": 136,
   "h": 34
  },
  "cumene-hydroperoxide": {
   "x": 1871.22,
   "y": 2146.75,
   "w": 136,
   "h": 34
  },
  "nitrobenzene": {
   "x": 1779.09,
   "y": 2208.28,
   "w": 136,
   "h": 34
  },
  "p-hydroxyazobenzene": {
   "x": 2022.94,
   "y": 2375.79,
   "w": 136,
   "h": 34
  },
  "phenol": {
   "x": 2356.06,
   "y": 1873.5,
   "w": 176,
   "h": 34
  },
  "phenolphthalein": {
   "x": 2022.84,
   "y": 2230.74,
   "w": 136,
   "h": 34
  },
  "phthalic-acid": {
   "x": 2347.94,
   "y": 1586.76,
   "w": 136,
   "h": 34
  },
  "picric-acid": {
   "x": 2604.82,
   "y": 2167.06,
   "w": 136,
   "h": 34
  },
  "salicylic-acid": {
   "x": 2512.86,
   "y": 1665.35,
   "w": 176,
   "h": 34
  },
  "sodium-benzenesulfonate": {
   "x": 2831.44,
   "y": 2184.66,
   "w": 136,
   "h": 34
  },
  "sodium-phenoxide": {
   "x": 2706.16,
   "y": 1976.14,
   "w": 136,
   "h": 34
  },
  "sodium-salicylate": {
   "x": 1615.07,
   "y": 2187.25,
   "w": 136,
   "h": 34
  },
  "terephthalic-acid": {
   "x": 2620.37,
   "y": 3155.87,
   "w": 136,
   "h": 34
  },
  "aniline": {
   "x": 1550.76,
   "y": 2354.48,
   "w": 136,
   "h": 34
  },
  "aniline-hydrochloride": {
   "x": 1178.19,
   "y": 2364.29,
   "w": 136,
   "h": 34
  },
  "cellulose": {
   "x": 1960.68,
   "y": 2292.58,
   "w": 136,
   "h": 34
  },
  "cellulose-acetate": {
   "x": 1854.19,
   "y": 2001.18,
   "w": 136,
   "h": 34
  },
  "cellulose-nitrate": {
   "x": 1831.19,
   "y": 2594.47,
   "w": 136,
   "h": 34
  },
  "fructose": {
   "x": 2336.42,
   "y": 2461.01,
   "w": 136,
   "h": 34
  },
  "galactose": {
   "x": 2367.03,
   "y": 2539.93,
   "w": 136,
   "h": 34
  },
  "glucose": {
   "x": 2186.98,
   "y": 2375.27,
   "w": 176,
   "h": 34
  },
  "lactose": {
   "x": 2640.04,
   "y": 2313.21,
   "w": 136,
   "h": 34
  },
  "maltose": {
   "x": 2509.74,
   "y": 2470.05,
   "w": 136,
   "h": 34
  },
  "mannose": {
   "x": 2815.87,
   "y": 2059.79,
   "w": 136,
   "h": 34
  },
  "sorbitol": {
   "x": 1085.52,
   "y": 2241.87,
   "w": 136,
   "h": 34
  },
  "starch": {
   "x": 1758.46,
   "y": 2521.04,
   "w": 136,
   "h": 34
  },
  "sucrose": {
   "x": 1908.33,
   "y": 2730.76,
   "w": 136,
   "h": 34
  },
  "6-aminohexanoic-acid": {
   "x": 2443.9,
   "y": 2799.5,
   "w": 136,
   "h": 34
  },
  "alanine": {
   "x": 1965.68,
   "y": 3053.41,
   "w": 176,
   "h": 34
  },
  "alanylglycine": {
   "x": 1814.22,
   "y": 2965.9,
   "w": 136,
   "h": 34
  },
  "cysteine": {
   "x": 1434.45,
   "y": 3255.62,
   "w": 136,
   "h": 34
  },
  "cystine": {
   "x": 1654.01,
   "y": 3277.83,
   "w": 136,
   "h": 34
  },
  "glycine": {
   "x": 2091.36,
   "y": 3137.48,
   "w": 194,
   "h": 34
  },
  "glycylalanine": {
   "x": 2334.2,
   "y": 2864.28,
   "w": 136,
   "h": 34
  },
  "glycylglycine": {
   "x": 2514.67,
   "y": 2968.45,
   "w": 136,
   "h": 34
  },
  "protein": {
   "x": 1069.37,
   "y": 3017.09,
   "w": 136,
   "h": 34
  },
  "acrylonitrile": {
   "x": 2283.36,
   "y": 3392.06,
   "w": 136,
   "h": 34
  },
  "br": {
   "x": 2624.21,
   "y": 2642.31,
   "w": 136,
   "h": 34
  },
  "butadiene": {
   "x": 2671.06,
   "y": 2537.63,
   "w": 136,
   "h": 34
  },
  "caprolactam": {
   "x": 3082.98,
   "y": 2520.09,
   "w": 136,
   "h": 34
  },
  "chloroprene": {
   "x": 1276.22,
   "y": 3005.74,
   "w": 136,
   "h": 34
  },
  "chloroprene-rubber": {
   "x": 1418.51,
   "y": 2869.34,
   "w": 136,
   "h": 34
  },
  "hexamethylenediamine": {
   "x": 1682.55,
   "y": 2656.03,
   "w": 136,
   "h": 34
  },
  "iir": {
   "x": 884.57,
   "y": 2343.92,
   "w": 136,
   "h": 34
  },
  "isoprene": {
   "x": 1255.85,
   "y": 2521.58,
   "w": 136,
   "h": 34
  },
  "melamine": {
   "x": 1419.95,
   "y": 2552.29,
   "w": 136,
   "h": 34
  },
  "melamine-resin": {
   "x": 1531.06,
   "y": 2490.28,
   "w": 136,
   "h": 34
  },
  "methyl-methacrylate": {
   "x": 2784.47,
   "y": 3123.22,
   "w": 136,
   "h": 34
  },
  "nylon6": {
   "x": 1855.86,
   "y": 2802.16,
   "w": 136,
   "h": 34
  },
  "nylon66": {
   "x": 1694.04,
   "y": 2903.8,
   "w": 136,
   "h": 34
  },
  "pan": {
   "x": 2682.61,
   "y": 3341.01,
   "w": 136,
   "h": 34
  },
  "pet": {
   "x": 2779.74,
   "y": 2929.6,
   "w": 136,
   "h": 34
  },
  "phenol-resin": {
   "x": 1638.79,
   "y": 2428.31,
   "w": 136,
   "h": 34
  },
  "pmma": {
   "x": 3165.6,
   "y": 2816.36,
   "w": 136,
   "h": 34
  },
  "polyacetylene": {
   "x": 2350.96,
   "y": 2167.24,
   "w": 136,
   "h": 34
  },
  "polyethylene": {
   "x": 2651.77,
   "y": 2038.17,
   "w": 136,
   "h": 34
  },
  "polypropylene": {
   "x": 2186.86,
   "y": 2230.54,
   "w": 136,
   "h": 34
  },
  "polystyrene": {
   "x": 2834.57,
   "y": 2792.07,
   "w": 136,
   "h": 34
  },
  "ptfe": {
   "x": 2948.5,
   "y": 3093.64,
   "w": 136,
   "h": 34
  },
  "pva": {
   "x": 2549.21,
   "y": 2386.91,
   "w": 136,
   "h": 34
  },
  "pvac": {
   "x": 2713.31,
   "y": 2402,
   "w": 136,
   "h": 34
  },
  "pvc": {
   "x": 2815.58,
   "y": 2339.9,
   "w": 136,
   "h": 34
  },
  "sbr": {
   "x": 2867.72,
   "y": 2621.96,
   "w": 136,
   "h": 34
  },
  "tetrafluoroethylene": {
   "x": 1230.21,
   "y": 2849.74,
   "w": 136,
   "h": 34
  },
  "urea": {
   "x": 812.54,
   "y": 1909.48,
   "w": 136,
   "h": 34
  },
  "urea-resin": {
   "x": 895.85,
   "y": 2115.92,
   "w": 136,
   "h": 34
  },
  "vinyl-acetate": {
   "x": 1858.84,
   "y": 2354.59,
   "w": 136,
   "h": 34
  },
  "vinyl-chloride": {
   "x": 2333.08,
   "y": 2313.12,
   "w": 136,
   "h": 34
  },
  "vinylon": {
   "x": 1988.88,
   "y": 2668.78,
   "w": 136,
   "h": 34
  },
  "1,3-dibromopropane": {
   "x": 4210,
   "y": 40,
   "w": 136,
   "h": 34
  },
  "1-bromopropane": {
   "x": 4362,
   "y": 40,
   "w": 136,
   "h": 34
  },
  "1-chloro-2-methylpropane": {
   "x": 4514,
   "y": 40,
   "w": 136,
   "h": 34
  },
  "1-chlorobutane": {
   "x": 4666,
   "y": 40,
   "w": 136,
   "h": 34
  },
  "1-chloropropane": {
   "x": 4818,
   "y": 40,
   "w": 136,
   "h": 34
  },
  "1-chloropropene": {
   "x": 4970,
   "y": 40,
   "w": 136,
   "h": 34
  },
  "2,2-dimethylbutane": {
   "x": 5122,
   "y": 40,
   "w": 136,
   "h": 34
  },
  "2,3-dimethylbutane": {
   "x": 5274,
   "y": 40,
   "w": 136,
   "h": 34
  },
  "2-bromopropane": {
   "x": 5426,
   "y": 40,
   "w": 136,
   "h": 34
  },
  "2-chlorobutane": {
   "x": 5578,
   "y": 40,
   "w": 136,
   "h": 34
  },
  "2-chloropropane": {
   "x": 5730,
   "y": 40,
   "w": 136,
   "h": 34
  },
  "2-chloropropene": {
   "x": 5882,
   "y": 40,
   "w": 136,
   "h": 34
  },
  "2-methylpentane": {
   "x": 4210,
   "y": 100,
   "w": 136,
   "h": 34
  },
  "3-chloropropene": {
   "x": 4362,
   "y": 100,
   "w": 136,
   "h": 34
  },
  "3-methylpentane": {
   "x": 4514,
   "y": 100,
   "w": 136,
   "h": 34
  },
  "acrolein": {
   "x": 4666,
   "y": 100,
   "w": 136,
   "h": 34
  },
  "allyl-alcohol": {
   "x": 4818,
   "y": 100,
   "w": 136,
   "h": 34
  },
  "but-1-ene": {
   "x": 4970,
   "y": 100,
   "w": 136,
   "h": 34
  },
  "but-1-yne": {
   "x": 5122,
   "y": 100,
   "w": 136,
   "h": 34
  },
  "but-2-ene": {
   "x": 5274,
   "y": 100,
   "w": 136,
   "h": 34
  },
  "but-2-yne": {
   "x": 5426,
   "y": 100,
   "w": 136,
   "h": 34
  },
  "but-3-enoic-acid": {
   "x": 5578,
   "y": 100,
   "w": 136,
   "h": 34
  },
  "butane": {
   "x": 5730,
   "y": 100,
   "w": 136,
   "h": 34
  },
  "carbon-tetrachloride": {
   "x": 5882,
   "y": 100,
   "w": 136,
   "h": 34
  },
  "chlorocyclohexane": {
   "x": 4210,
   "y": 160,
   "w": 136,
   "h": 34
  },
  "chloroethane": {
   "x": 4362,
   "y": 160,
   "w": 136,
   "h": 34
  },
  "chloroform": {
   "x": 4514,
   "y": 160,
   "w": 136,
   "h": 34
  },
  "crotonic-acid": {
   "x": 4666,
   "y": 160,
   "w": 136,
   "h": 34
  },
  "cyclobutane": {
   "x": 4818,
   "y": 160,
   "w": 136,
   "h": 34
  },
  "cyclohexene": {
   "x": 4970,
   "y": 160,
   "w": 136,
   "h": 34
  },
  "cyclopentane": {
   "x": 5122,
   "y": 160,
   "w": 136,
   "h": 34
  },
  "cyclopropane": {
   "x": 5274,
   "y": 160,
   "w": 136,
   "h": 34
  },
  "decane": {
   "x": 5426,
   "y": 160,
   "w": 136,
   "h": 34
  },
  "dichloromethane": {
   "x": 5578,
   "y": 160,
   "w": 136,
   "h": 34
  },
  "eicosane": {
   "x": 5730,
   "y": 160,
   "w": 136,
   "h": 34
  },
  "ethenol": {
   "x": 5882,
   "y": 160,
   "w": 136,
   "h": 34
  },
  "heptane": {
   "x": 4210,
   "y": 220,
   "w": 136,
   "h": 34
  },
  "hexane": {
   "x": 4362,
   "y": 220,
   "w": 136,
   "h": 34
  },
  "iodoethane": {
   "x": 4514,
   "y": 220,
   "w": 136,
   "h": 34
  },
  "isobutane": {
   "x": 4666,
   "y": 220,
   "w": 136,
   "h": 34
  },
  "isopentane": {
   "x": 4818,
   "y": 220,
   "w": 136,
   "h": 34
  },
  "neopentane": {
   "x": 4970,
   "y": 220,
   "w": 136,
   "h": 34
  },
  "nonane": {
   "x": 5122,
   "y": 220,
   "w": 136,
   "h": 34
  },
  "octane": {
   "x": 5274,
   "y": 220,
   "w": 136,
   "h": 34
  },
  "pent-1-ene": {
   "x": 5426,
   "y": 220,
   "w": 136,
   "h": 34
  },
  "pent-1-yne": {
   "x": 5578,
   "y": 220,
   "w": 136,
   "h": 34
  },
  "pent-2-ene": {
   "x": 5730,
   "y": 220,
   "w": 136,
   "h": 34
  },
  "pent-2-yne": {
   "x": 5882,
   "y": 220,
   "w": 136,
   "h": 34
  },
  "pentane": {
   "x": 4210,
   "y": 280,
   "w": 136,
   "h": 34
  },
  "prop-1-en-1-ol": {
   "x": 4362,
   "y": 280,
   "w": 136,
   "h": 34
  },
  "prop-1-en-2-ol": {
   "x": 4514,
   "y": 280,
   "w": 136,
   "h": 34
  },
  "anthracene": {
   "x": 4666,
   "y": 280,
   "w": 136,
   "h": 34
  },
  "m-xylene": {
   "x": 4818,
   "y": 280,
   "w": 136,
   "h": 34
  },
  "naphthalene": {
   "x": 4970,
   "y": 280,
   "w": 136,
   "h": 34
  },
  "p-dichlorobenzene": {
   "x": 5122,
   "y": 280,
   "w": 136,
   "h": 34
  },
  "p-divinylbenzene": {
   "x": 5274,
   "y": 280,
   "w": 136,
   "h": 34
  },
  "1-methoxypropane": {
   "x": 5426,
   "y": 280,
   "w": 136,
   "h": 34
  },
  "2,2-dimethylpropan-1-ol": {
   "x": 5578,
   "y": 280,
   "w": 136,
   "h": 34
  },
  "2-methoxypropane": {
   "x": 5730,
   "y": 280,
   "w": 136,
   "h": 34
  },
  "2-methylbutan-1-ol": {
   "x": 5882,
   "y": 280,
   "w": 136,
   "h": 34
  },
  "2-methylbutan-2-ol": {
   "x": 4210,
   "y": 340,
   "w": 136,
   "h": 34
  },
  "2-methylpropan-1-ol": {
   "x": 4362,
   "y": 340,
   "w": 136,
   "h": 34
  },
  "3-methylbutan-2-ol": {
   "x": 4514,
   "y": 340,
   "w": 136,
   "h": 34
  },
  "butan-2-ol": {
   "x": 4666,
   "y": 340,
   "w": 136,
   "h": 34
  },
  "dimethyl-ether": {
   "x": 4818,
   "y": 340,
   "w": 136,
   "h": 34
  },
  "ethanolamine": {
   "x": 4970,
   "y": 340,
   "w": 136,
   "h": 34
  },
  "methoxyethane": {
   "x": 5122,
   "y": 340,
   "w": 136,
   "h": 34
  },
  "pentan-1-ol": {
   "x": 5274,
   "y": 340,
   "w": 136,
   "h": 34
  },
  "pentan-2-ol": {
   "x": 5426,
   "y": 340,
   "w": 136,
   "h": 34
  },
  "pentan-3-ol": {
   "x": 5578,
   "y": 340,
   "w": 136,
   "h": 34
  },
  "propylene-glycol": {
   "x": 5730,
   "y": 340,
   "w": 136,
   "h": 34
  },
  "2,2-dimethylpropanal": {
   "x": 5882,
   "y": 340,
   "w": 136,
   "h": 34
  },
  "2,2-dimethylpropanoic-acid": {
   "x": 4210,
   "y": 400,
   "w": 136,
   "h": 34
  },
  "2-methylbutanal": {
   "x": 4362,
   "y": 400,
   "w": 136,
   "h": 34
  },
  "2-methylbutanoic-acid": {
   "x": 4514,
   "y": 400,
   "w": 136,
   "h": 34
  },
  "2-methylpropanal": {
   "x": 4666,
   "y": 400,
   "w": 136,
   "h": 34
  },
  "2-methylpropanoic-acid": {
   "x": 4818,
   "y": 400,
   "w": 136,
   "h": 34
  },
  "3-methylbutanal": {
   "x": 4970,
   "y": 400,
   "w": 136,
   "h": 34
  },
  "3-methylbutanoic-acid": {
   "x": 5122,
   "y": 400,
   "w": 136,
   "h": 34
  },
  "acrylic-acid": {
   "x": 5274,
   "y": 400,
   "w": 136,
   "h": 34
  },
  "butanone": {
   "x": 5426,
   "y": 400,
   "w": 136,
   "h": 34
  },
  "calcium-acetate": {
   "x": 5578,
   "y": 400,
   "w": 136,
   "h": 34
  },
  "citric-acid": {
   "x": 5730,
   "y": 400,
   "w": 136,
   "h": 34
  },
  "fumaric-acid": {
   "x": 5882,
   "y": 400,
   "w": 136,
   "h": 34
  },
  "glutaric-acid": {
   "x": 4210,
   "y": 460,
   "w": 136,
   "h": 34
  },
  "ibuprofen": {
   "x": 4362,
   "y": 460,
   "w": 136,
   "h": 34
  },
  "lactic-acid": {
   "x": 4514,
   "y": 460,
   "w": 136,
   "h": 34
  },
  "lead-ii-acetate": {
   "x": 4666,
   "y": 460,
   "w": 136,
   "h": 34
  },
  "m-hydroxybenzoic-acid": {
   "x": 4818,
   "y": 460,
   "w": 136,
   "h": 34
  },
  "malic-acid": {
   "x": 4970,
   "y": 460,
   "w": 136,
   "h": 34
  },
  "malonic-acid": {
   "x": 5122,
   "y": 460,
   "w": 136,
   "h": 34
  },
  "methacrylic-acid": {
   "x": 5274,
   "y": 460,
   "w": 136,
   "h": 34
  },
  "p-hydroxybenzoic-acid": {
   "x": 5426,
   "y": 460,
   "w": 136,
   "h": 34
  },
  "pentan-3-one": {
   "x": 5578,
   "y": 460,
   "w": 136,
   "h": 34
  },
  "pentanal": {
   "x": 5730,
   "y": 460,
   "w": 136,
   "h": 34
  },
  "pentanoic-acid": {
   "x": 5882,
   "y": 460,
   "w": 136,
   "h": 34
  },
  "pyruvic-acid": {
   "x": 4210,
   "y": 520,
   "w": 136,
   "h": 34
  },
  "succinic-acid": {
   "x": 4362,
   "y": 520,
   "w": 136,
   "h": 34
  },
  "tartaric-acid": {
   "x": 4514,
   "y": 520,
   "w": 136,
   "h": 34
  },
  "terephthaloyl-chloride": {
   "x": 4666,
   "y": 520,
   "w": 136,
   "h": 34
  },
  "arachidonic-acid": {
   "x": 4818,
   "y": 520,
   "w": 136,
   "h": 34
  },
  "diphenyl-oxalate": {
   "x": 4970,
   "y": 520,
   "w": 136,
   "h": 34
  },
  "docosahexaenoic-acid": {
   "x": 5122,
   "y": 520,
   "w": 136,
   "h": 34
  },
  "eicosapentaenoic-acid": {
   "x": 5274,
   "y": 520,
   "w": 136,
   "h": 34
  },
  "elaidic-acid": {
   "x": 5426,
   "y": 520,
   "w": 136,
   "h": 34
  },
  "las": {
   "x": 5578,
   "y": 520,
   "w": 136,
   "h": 34
  },
  "lauric-acid": {
   "x": 5730,
   "y": 520,
   "w": 136,
   "h": 34
  },
  "linolenic-acid": {
   "x": 5882,
   "y": 520,
   "w": 136,
   "h": 34
  },
  "myristic-acid": {
   "x": 4210,
   "y": 580,
   "w": 136,
   "h": 34
  },
  "propyl-formate": {
   "x": 4362,
   "y": 580,
   "w": 136,
   "h": 34
  },
  "sds": {
   "x": 4514,
   "y": 580,
   "w": 136,
   "h": 34
  },
  "sodium-laurate": {
   "x": 4666,
   "y": 580,
   "w": 136,
   "h": 34
  },
  "1-naphthol": {
   "x": 4818,
   "y": 580,
   "w": 136,
   "h": 34
  },
  "2-naphthol": {
   "x": 4970,
   "y": 580,
   "w": 136,
   "h": 34
  },
  "2-nitrobenzaldehyde": {
   "x": 5122,
   "y": 580,
   "w": 136,
   "h": 34
  },
  "acetaminophen": {
   "x": 5274,
   "y": 580,
   "w": 136,
   "h": 34
  },
  "alizarin": {
   "x": 5426,
   "y": 580,
   "w": 136,
   "h": 34
  },
  "anisole": {
   "x": 5578,
   "y": 580,
   "w": 136,
   "h": 34
  },
  "benzonitrile": {
   "x": 5730,
   "y": 580,
   "w": 136,
   "h": 34
  },
  "bisphenol-a": {
   "x": 5882,
   "y": 580,
   "w": 136,
   "h": 34
  },
  "carminic-acid": {
   "x": 4210,
   "y": 640,
   "w": 136,
   "h": 34
  },
  "carthamin": {
   "x": 4362,
   "y": 640,
   "w": 136,
   "h": 34
  },
  "catechol": {
   "x": 4514,
   "y": 640,
   "w": 136,
   "h": 34
  },
  "dibromoindigo": {
   "x": 4666,
   "y": 640,
   "w": 136,
   "h": 34
  },
  "disodium-salicylate": {
   "x": 4818,
   "y": 640,
   "w": 136,
   "h": 34
  },
  "guaiacol": {
   "x": 4970,
   "y": 640,
   "w": 136,
   "h": 34
  },
  "hydroquinone": {
   "x": 5122,
   "y": 640,
   "w": 136,
   "h": 34
  },
  "indigo": {
   "x": 5274,
   "y": 640,
   "w": 136,
   "h": 34
  },
  "isophthalic-acid": {
   "x": 5426,
   "y": 640,
   "w": 136,
   "h": 34
  },
  "m-cresol": {
   "x": 5578,
   "y": 640,
   "w": 136,
   "h": 34
  },
  "m-nitrotoluene": {
   "x": 5730,
   "y": 640,
   "w": 136,
   "h": 34
  },
  "methyl-orange": {
   "x": 5882,
   "y": 640,
   "w": 136,
   "h": 34
  },
  "ninhydrin": {
   "x": 4210,
   "y": 700,
   "w": 136,
   "h": 34
  },
  "o-cresol": {
   "x": 4362,
   "y": 700,
   "w": 136,
   "h": 34
  },
  "o-nitrophenol": {
   "x": 4514,
   "y": 700,
   "w": 136,
   "h": 34
  },
  "o-nitrotoluene": {
   "x": 4666,
   "y": 700,
   "w": 136,
   "h": 34
  },
  "p-cresol": {
   "x": 4818,
   "y": 700,
   "w": 136,
   "h": 34
  },
  "p-nitrophenol": {
   "x": 4970,
   "y": 700,
   "w": 136,
   "h": 34
  },
  "p-nitrotoluene": {
   "x": 5122,
   "y": 700,
   "w": 136,
   "h": 34
  },
  "phenoxide-ion": {
   "x": 5274,
   "y": 700,
   "w": 136,
   "h": 34
  },
  "quercetin": {
   "x": 5426,
   "y": 700,
   "w": 136,
   "h": 34
  },
  "resorcinol": {
   "x": 5578,
   "y": 700,
   "w": 136,
   "h": 34
  },
  "shikonin": {
   "x": 5730,
   "y": 700,
   "w": 136,
   "h": 34
  },
  "sulfanilamide": {
   "x": 5882,
   "y": 700,
   "w": 136,
   "h": 34
  },
  "sulfanilic-acid": {
   "x": 4210,
   "y": 760,
   "w": 136,
   "h": 34
  },
  "tnt": {
   "x": 4362,
   "y": 760,
   "w": 136,
   "h": 34
  },
  "2-methylpropan-1-amine": {
   "x": 4514,
   "y": 760,
   "w": 136,
   "h": 34
  },
  "2-methylpropan-2-amine": {
   "x": 4666,
   "y": 760,
   "w": 136,
   "h": 34
  },
  "acetonitrile": {
   "x": 4818,
   "y": 760,
   "w": 136,
   "h": 34
  },
  "butan-1-amine": {
   "x": 4970,
   "y": 760,
   "w": 136,
   "h": 34
  },
  "butan-2-amine": {
   "x": 5122,
   "y": 760,
   "w": 136,
   "h": 34
  },
  "butanenitrile": {
   "x": 5274,
   "y": 760,
   "w": 136,
   "h": 34
  },
  "diethylamine": {
   "x": 5426,
   "y": 760,
   "w": 136,
   "h": 34
  },
  "diethylenetriamine": {
   "x": 5578,
   "y": 760,
   "w": 136,
   "h": 34
  },
  "dimethylamine": {
   "x": 5730,
   "y": 760,
   "w": 136,
   "h": 34
  },
  "ethylamine": {
   "x": 5882,
   "y": 760,
   "w": 136,
   "h": 34
  },
  "ethylmethylamine": {
   "x": 4210,
   "y": 820,
   "w": 136,
   "h": 34
  },
  "isopropylamine": {
   "x": 4362,
   "y": 820,
   "w": 136,
   "h": 34
  },
  "methylamine": {
   "x": 4514,
   "y": 820,
   "w": 136,
   "h": 34
  },
  "n,n-dimethylaniline": {
   "x": 4666,
   "y": 820,
   "w": 136,
   "h": 34
  },
  "n,n-dimethylethanamine": {
   "x": 4818,
   "y": 820,
   "w": 136,
   "h": 34
  },
  "n-methylpropan-1-amine": {
   "x": 4970,
   "y": 820,
   "w": 136,
   "h": 34
  },
  "n-methylpropan-2-amine": {
   "x": 5122,
   "y": 820,
   "w": 136,
   "h": 34
  },
  "nitromethane": {
   "x": 5274,
   "y": 820,
   "w": 136,
   "h": 34
  },
  "p-phenylenediamine": {
   "x": 5426,
   "y": 820,
   "w": 136,
   "h": 34
  },
  "propanenitrile": {
   "x": 5578,
   "y": 820,
   "w": 136,
   "h": 34
  },
  "propylamine": {
   "x": 5730,
   "y": 820,
   "w": 136,
   "h": 34
  },
  "triethylamine": {
   "x": 5882,
   "y": 820,
   "w": 136,
   "h": 34
  },
  "trimethylamine": {
   "x": 4210,
   "y": 880,
   "w": 136,
   "h": 34
  },
  "amylopectin": {
   "x": 4362,
   "y": 880,
   "w": 136,
   "h": 34
  },
  "cellobiose": {
   "x": 4514,
   "y": 880,
   "w": 136,
   "h": 34
  },
  "chitin": {
   "x": 4666,
   "y": 880,
   "w": 136,
   "h": 34
  },
  "deoxyribose": {
   "x": 4818,
   "y": 880,
   "w": 136,
   "h": 34
  },
  "dextrin": {
   "x": 4970,
   "y": 880,
   "w": 136,
   "h": 34
  },
  "glycogen": {
   "x": 5122,
   "y": 880,
   "w": 136,
   "h": 34
  },
  "inositol": {
   "x": 5274,
   "y": 880,
   "w": 136,
   "h": 34
  },
  "isomaltose": {
   "x": 5426,
   "y": 880,
   "w": 136,
   "h": 34
  },
  "ribose": {
   "x": 5578,
   "y": 880,
   "w": 136,
   "h": 34
  },
  "salicin": {
   "x": 5730,
   "y": 880,
   "w": 136,
   "h": 34
  },
  "trehalose": {
   "x": 5882,
   "y": 880,
   "w": 136,
   "h": 34
  },
  "albumin": {
   "x": 4210,
   "y": 940,
   "w": 136,
   "h": 34
  },
  "amylase": {
   "x": 4362,
   "y": 940,
   "w": 136,
   "h": 34
  },
  "arginine": {
   "x": 4514,
   "y": 940,
   "w": 136,
   "h": 34
  },
  "asparagine": {
   "x": 4666,
   "y": 940,
   "w": 136,
   "h": 34
  },
  "aspartame": {
   "x": 4818,
   "y": 940,
   "w": 136,
   "h": 34
  },
  "aspartic-acid": {
   "x": 4970,
   "y": 940,
   "w": 136,
   "h": 34
  },
  "atpase": {
   "x": 5122,
   "y": 940,
   "w": 136,
   "h": 34
  },
  "casein": {
   "x": 5274,
   "y": 940,
   "w": 136,
   "h": 34
  },
  "catalase": {
   "x": 5426,
   "y": 940,
   "w": 136,
   "h": 34
  },
  "cellobiase": {
   "x": 5578,
   "y": 940,
   "w": 136,
   "h": 34
  },
  "cellulase": {
   "x": 5730,
   "y": 940,
   "w": 136,
   "h": 34
  },
  "choline": {
   "x": 5882,
   "y": 940,
   "w": 136,
   "h": 34
  },
  "collagen": {
   "x": 4210,
   "y": 1000,
   "w": 136,
   "h": 34
  },
  "erepsin": {
   "x": 4362,
   "y": 1000,
   "w": 136,
   "h": 34
  },
  "fibroin": {
   "x": 4514,
   "y": 1000,
   "w": 136,
   "h": 34
  },
  "gelatin": {
   "x": 4666,
   "y": 1000,
   "w": 136,
   "h": 34
  },
  "gliadin": {
   "x": 4818,
   "y": 1000,
   "w": 136,
   "h": 34
  },
  "globin": {
   "x": 4970,
   "y": 1000,
   "w": 136,
   "h": 34
  },
  "globulin": {
   "x": 5122,
   "y": 1000,
   "w": 136,
   "h": 34
  },
  "glutamic-acid": {
   "x": 5274,
   "y": 1000,
   "w": 136,
   "h": 34
  },
  "glutamine": {
   "x": 5426,
   "y": 1000,
   "w": 136,
   "h": 34
  },
  "glutathione": {
   "x": 5578,
   "y": 1000,
   "w": 136,
   "h": 34
  },
  "glutelin": {
   "x": 5730,
   "y": 1000,
   "w": 136,
   "h": 34
  },
  "glutenin": {
   "x": 5882,
   "y": 1000,
   "w": 136,
   "h": 34
  },
  "helicase": {
   "x": 4210,
   "y": 1060,
   "w": 136,
   "h": 34
  },
  "heme": {
   "x": 4362,
   "y": 1060,
   "w": 136,
   "h": 34
  },
  "hemocyanin": {
   "x": 4514,
   "y": 1060,
   "w": 136,
   "h": 34
  },
  "hemoglobin": {
   "x": 4666,
   "y": 1060,
   "w": 136,
   "h": 34
  },
  "histidine": {
   "x": 4818,
   "y": 1060,
   "w": 136,
   "h": 34
  },
  "histone": {
   "x": 4970,
   "y": 1060,
   "w": 136,
   "h": 34
  },
  "hordein": {
   "x": 5122,
   "y": 1060,
   "w": 136,
   "h": 34
  },
  "insulin": {
   "x": 5274,
   "y": 1060,
   "w": 136,
   "h": 34
  },
  "isoleucine": {
   "x": 5426,
   "y": 1060,
   "w": 136,
   "h": 34
  },
  "keratin": {
   "x": 5578,
   "y": 1060,
   "w": 136,
   "h": 34
  },
  "lactase": {
   "x": 5730,
   "y": 1060,
   "w": 136,
   "h": 34
  },
  "leucine": {
   "x": 5882,
   "y": 1060,
   "w": 136,
   "h": 34
  },
  "lipase": {
   "x": 4210,
   "y": 1120,
   "w": 136,
   "h": 34
  },
  "lysine": {
   "x": 4362,
   "y": 1120,
   "w": 136,
   "h": 34
  },
  "maltase": {
   "x": 4514,
   "y": 1120,
   "w": 136,
   "h": 34
  },
  "methionine": {
   "x": 4666,
   "y": 1120,
   "w": 136,
   "h": 34
  },
  "mucin": {
   "x": 4818,
   "y": 1120,
   "w": 136,
   "h": 34
  },
  "oryzenin": {
   "x": 4970,
   "y": 1120,
   "w": 136,
   "h": 34
  },
  "pepsin": {
   "x": 5122,
   "y": 1120,
   "w": 136,
   "h": 34
  },
  "phenylalanine": {
   "x": 5274,
   "y": 1120,
   "w": 136,
   "h": 34
  },
  "proline": {
   "x": 5426,
   "y": 1120,
   "w": 136,
   "h": 34
  },
  "protamine": {
   "x": 5578,
   "y": 1120,
   "w": 136,
   "h": 34
  },
  "protease": {
   "x": 5730,
   "y": 1120,
   "w": 136,
   "h": 34
  },
  "salmine": {
   "x": 5882,
   "y": 1120,
   "w": 136,
   "h": 34
  },
  "serine": {
   "x": 4210,
   "y": 1180,
   "w": 136,
   "h": 34
  },
  "sucrase": {
   "x": 4362,
   "y": 1180,
   "w": 136,
   "h": 34
  },
  "threonine": {
   "x": 4514,
   "y": 1180,
   "w": 136,
   "h": 34
  },
  "trypsin": {
   "x": 4666,
   "y": 1180,
   "w": 136,
   "h": 34
  },
  "tryptophan": {
   "x": 4818,
   "y": 1180,
   "w": 136,
   "h": 34
  },
  "tyrosine": {
   "x": 4970,
   "y": 1180,
   "w": 136,
   "h": 34
  },
  "urease": {
   "x": 5122,
   "y": 1180,
   "w": 136,
   "h": 34
  },
  "valine": {
   "x": 5274,
   "y": 1180,
   "w": 136,
   "h": 34
  },
  "zymase": {
   "x": 5426,
   "y": 1180,
   "w": 136,
   "h": 34
  },
  "abs": {
   "x": 5578,
   "y": 1180,
   "w": 136,
   "h": 34
  },
  "adenine": {
   "x": 5730,
   "y": 1180,
   "w": 136,
   "h": 34
  },
  "adenosine": {
   "x": 5882,
   "y": 1180,
   "w": 136,
   "h": 34
  },
  "adp": {
   "x": 4210,
   "y": 1240,
   "w": 136,
   "h": 34
  },
  "alginic-acid": {
   "x": 4362,
   "y": 1240,
   "w": 136,
   "h": 34
  },
  "alkyd-resin": {
   "x": 4514,
   "y": 1240,
   "w": 136,
   "h": 34
  },
  "anion-exchange-resin": {
   "x": 4666,
   "y": 1240,
   "w": 136,
   "h": 34
  },
  "aramid": {
   "x": 4818,
   "y": 1240,
   "w": 136,
   "h": 34
  },
  "atp": {
   "x": 4970,
   "y": 1240,
   "w": 136,
   "h": 34
  },
  "cation-exchange-resin": {
   "x": 5122,
   "y": 1240,
   "w": 136,
   "h": 34
  },
  "cytosine": {
   "x": 5274,
   "y": 1240,
   "w": 136,
   "h": 34
  },
  "dimethyldichlorosilane": {
   "x": 5426,
   "y": 1240,
   "w": 136,
   "h": 34
  },
  "dna": {
   "x": 5578,
   "y": 1240,
   "w": 136,
   "h": 34
  },
  "epichlorohydrin": {
   "x": 5730,
   "y": 1240,
   "w": 136,
   "h": 34
  },
  "epoxy-resin": {
   "x": 5882,
   "y": 1240,
   "w": 136,
   "h": 34
  },
  "guanine": {
   "x": 4210,
   "y": 1300,
   "w": 136,
   "h": 34
  },
  "natural-rubber": {
   "x": 4362,
   "y": 1300,
   "w": 136,
   "h": 34
  },
  "nbr": {
   "x": 4514,
   "y": 1300,
   "w": 136,
   "h": 34
  },
  "phosgene": {
   "x": 4666,
   "y": 1300,
   "w": 136,
   "h": 34
  },
  "pla": {
   "x": 4818,
   "y": 1300,
   "w": 136,
   "h": 34
  },
  "polyaniline": {
   "x": 4970,
   "y": 1300,
   "w": 136,
   "h": 34
  },
  "polycarbonate": {
   "x": 5122,
   "y": 1300,
   "w": 136,
   "h": 34
  },
  "polyurethane": {
   "x": 5274,
   "y": 1300,
   "w": 136,
   "h": 34
  },
  "pvdc": {
   "x": 5426,
   "y": 1300,
   "w": 136,
   "h": 34
  },
  "rna": {
   "x": 5578,
   "y": 1300,
   "w": 136,
   "h": 34
  },
  "silicone": {
   "x": 5730,
   "y": 1300,
   "w": 136,
   "h": 34
  },
  "sodium-alginate": {
   "x": 5882,
   "y": 1300,
   "w": 136,
   "h": 34
  },
  "sodium-polyacrylate": {
   "x": 4210,
   "y": 1360,
   "w": 136,
   "h": 34
  },
  "thymine": {
   "x": 4362,
   "y": 1360,
   "w": 136,
   "h": 34
  },
  "unsaturated-polyester": {
   "x": 4514,
   "y": 1360,
   "w": 136,
   "h": 34
  },
  "uracil": {
   "x": 4666,
   "y": 1360,
   "w": 136,
   "h": 34
  },
  "vinylidene-chloride": {
   "x": 4818,
   "y": 1360,
   "w": 136,
   "h": 34
  }
 },
 "markers": {
  "2-methylpropan-2-ol-dehydration": {
   "x": 1317.46,
   "y": 2700.89,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1343.46,
     "y": 2700.89
    },
    "cond": null,
    "box": {
     "x": 1325.46,
     "y": 2692.89,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "2-methylpropan-2-ol-hydrogen-chloride": {
   "x": 2181.08,
   "y": 2685.41,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2207.08,
     "y": 2685.41
    },
    "cond": null,
    "box": {
     "x": 2189.08,
     "y": 2677.41,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "acetic-acid-anhydride": {
   "x": 2381.84,
   "y": 1382.96,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2407.84,
     "y": 1382.96
    },
    "cond": null,
    "box": {
     "x": 2389.84,
     "y": 1374.96,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "acetic-acid-butanol-esterification": {
   "x": 2671.52,
   "y": 1189.8,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2718.52,
     "y": 1189.8
    },
    "cond": null,
    "box": {
     "x": 2679.52,
     "y": 1181.8,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "acetic-acid-ethanol-esterification": {
   "x": 2063.83,
   "y": 1328.79,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2110.83,
     "y": 1328.79
    },
    "cond": null,
    "box": {
     "x": 2071.83,
     "y": 1320.79,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "acetic-acid-glycerol-esterification": {
   "x": 1778.32,
   "y": 1723.72,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1825.32,
     "y": 1723.72
    },
    "cond": null,
    "box": {
     "x": 1786.32,
     "y": 1715.72,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "acetic-acid-isoamyl-esterification": {
   "x": 2032.17,
   "y": 1576.06,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2079.17,
     "y": 1576.06
    },
    "cond": null,
    "box": {
     "x": 2040.17,
     "y": 1568.06,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "acetic-acid-methanol-esterification": {
   "x": 1735.26,
   "y": 1649.68,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1782.26,
     "y": 1649.68
    },
    "cond": null,
    "box": {
     "x": 1743.26,
     "y": 1641.68,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "acetic-acid-neutralization": {
   "x": 2379.94,
   "y": 1456.76,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2405.94,
     "y": 1456.76
    },
    "cond": null,
    "box": {
     "x": 2387.94,
     "y": 1448.76,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "acetic-acid-sodium-carbonate": {
   "x": 2350.2,
   "y": 1529.44,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2376.2,
     "y": 1529.44
    },
    "cond": null,
    "box": {
     "x": 2358.2,
     "y": 1521.44,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "acetic-anhydride-hydrolysis": {
   "x": 2386.16,
   "y": 1308.86,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2426.16,
     "y": 1308.86
    },
    "cond": null,
    "box": {
     "x": 2394.16,
     "y": 1300.86,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "acetone-iodoform": {
   "x": 1862.61,
   "y": 1208.12,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1888.61,
     "y": 1208.12
    },
    "cond": null,
    "box": {
     "x": 1870.61,
     "y": 1200.12,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "acetone-reduction": {
   "x": 1968.23,
   "y": 1649.99,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1994.23,
     "y": 1649.99
    },
    "cond": null,
    "box": {
     "x": 1976.23,
     "y": 1641.99,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "acrylonitrile-polymerization": {
   "x": 2511.09,
   "y": 3359.48,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2551.09,
     "y": 3359.48
    },
    "cond": null,
    "box": {
     "x": 2519.09,
     "y": 3351.48,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "alanine-glycine-peptide": {
   "x": 1866.9,
   "y": 3171.38,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1920.9,
     "y": 3171.38
    },
    "cond": null,
    "box": {
     "x": 1874.9,
     "y": 3163.38,
     "w": 92,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "alanylglycine-hydrolysis": {
   "x": 1998.32,
   "y": 2978.21,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2038.32,
     "y": 2978.21
    },
    "cond": null,
    "box": {
     "x": 2006.32,
     "y": 2970.21,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "alkyne-hydration-ethyne-ethanal": {
   "x": 2095.45,
   "y": 1113.23,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2121.45,
     "y": 1113.23
    },
    "cond": null,
    "box": {
     "x": 2103.45,
     "y": 1105.23,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "aniline-acetic-anhydride": {
   "x": 2554.33,
   "y": 1609.34,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2601.33,
     "y": 1609.34
    },
    "cond": null,
    "box": {
     "x": 2562.33,
     "y": 1601.34,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "aniline-diazotization": {
   "x": 2163.98,
   "y": 2175.09,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2203.98,
     "y": 2175.09
    },
    "cond": null,
    "box": {
     "x": 2171.98,
     "y": 2167.09,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "aniline-hydrochloride": {
   "x": 1283.94,
   "y": 2245.26,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1309.94,
     "y": 2245.26
    },
    "cond": null,
    "box": {
     "x": 1291.94,
     "y": 2237.26,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "aniline-hydrochloride-basification": {
   "x": 1386.04,
   "y": 2248.03,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1412.04,
     "y": 2248.03
    },
    "cond": null,
    "box": {
     "x": 1394.04,
     "y": 2240.03,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "arene-hydrogenation-benzene-cyclohexane": {
   "x": 2181.09,
   "y": 1038.56,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2221.09,
     "y": 1038.56
    },
    "cond": null,
    "box": {
     "x": 2189.09,
     "y": 1030.56,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "aromatic-side-chain-oxidation-o-xylene-phthalic-acid": {
   "x": 2483.85,
   "y": 1448.66,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2509.85,
     "y": 1448.66
    },
    "cond": null,
    "box": {
     "x": 2491.85,
     "y": 1440.66,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "aspirin-hydrolysis": {
   "x": 2698.36,
   "y": 1609.32,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2738.36,
     "y": 1609.32
    },
    "cond": null,
    "box": {
     "x": 2706.36,
     "y": 1601.32,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "benzaldehyde-oxidation": {
   "x": 1816.23,
   "y": 2745.99,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1842.23,
     "y": 2745.99
    },
    "cond": null,
    "box": {
     "x": 1824.23,
     "y": 2737.99,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "benzene-chlorination": {
   "x": 1634.3,
   "y": 1735.36,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1681.3,
     "y": 1735.36
    },
    "cond": null,
    "box": {
     "x": 1642.3,
     "y": 1727.36,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "benzene-chlorine-addition": {
   "x": 2603.37,
   "y": 1081.24,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2629.37,
     "y": 1081.24
    },
    "cond": null,
    "box": {
     "x": 2611.37,
     "y": 1073.24,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "benzene-nitration": {
   "x": 1816.74,
   "y": 1797.75,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1856.74,
     "y": 1797.75
    },
    "cond": null,
    "box": {
     "x": 1824.74,
     "y": 1789.75,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "benzene-propene-cumene": {
   "x": 1950.97,
   "y": 965.84,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1997.97,
     "y": 965.84
    },
    "cond": null,
    "box": {
     "x": 1958.97,
     "y": 957.84,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "benzene-sulfonation": {
   "x": 1411.56,
   "y": 1684.46,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1458.56,
     "y": 1684.46
    },
    "cond": null,
    "box": {
     "x": 1419.56,
     "y": 1676.46,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "benzenesulfonic-acid-neutralization": {
   "x": 1977.03,
   "y": 2090.94,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2003.03,
     "y": 2090.94
    },
    "cond": null,
    "box": {
     "x": 1985.03,
     "y": 2082.94,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "benzoic-acid-neutralization": {
   "x": 3187.95,
   "y": 2345.57,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 3213.95,
     "y": 2345.57
    },
    "cond": null,
    "box": {
     "x": 3195.95,
     "y": 2337.57,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "benzyl-alcohol-oxidation": {
   "x": 1174.97,
   "y": 2737.55,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1200.97,
     "y": 2737.55
    },
    "cond": null,
    "box": {
     "x": 1182.97,
     "y": 2729.55,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "butadiene-polymerization": {
   "x": 2855.06,
   "y": 2538.66,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2895.06,
     "y": 2538.66
    },
    "cond": null,
    "box": {
     "x": 2863.06,
     "y": 2530.66,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "butan-1-ol-oxidation": {
   "x": 3059.48,
   "y": 1198.3,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 3085.48,
     "y": 1198.3
    },
    "cond": null,
    "box": {
     "x": 3067.48,
     "y": 1190.3,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "butanal-reduction": {
   "x": 2913.69,
   "y": 1446.01,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2939.69,
     "y": 1446.01
    },
    "cond": null,
    "box": {
     "x": 2921.69,
     "y": 1438.01,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "butanoic-acid-ethanol-esterification": {
   "x": 2982.58,
   "y": 1580.64,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 3029.58,
     "y": 1580.64
    },
    "cond": null,
    "box": {
     "x": 2990.58,
     "y": 1572.64,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "caprolactam-ring-opening": {
   "x": 2107.18,
   "y": 2904.27,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2147.18,
     "y": 2904.27
    },
    "cond": null,
    "box": {
     "x": 2115.18,
     "y": 2896.27,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "cellulose-acetylation": {
   "x": 2135.03,
   "y": 1861.71,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2161.03,
     "y": 1861.71
    },
    "cond": null,
    "box": {
     "x": 2143.03,
     "y": 1853.71,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "cellulose-hydrolysis": {
   "x": 2057.58,
   "y": 2464.65,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2097.58,
     "y": 2464.65
    },
    "cond": null,
    "box": {
     "x": 2065.58,
     "y": 2456.65,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "cellulose-nitration": {
   "x": 1938.91,
   "y": 2464.84,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1964.91,
     "y": 2464.84
    },
    "cond": null,
    "box": {
     "x": 1946.91,
     "y": 2456.84,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "chlorobenzene-dow-phenol": {
   "x": 2269.77,
   "y": 2037.35,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2295.77,
     "y": 2037.35
    },
    "cond": null,
    "box": {
     "x": 2277.77,
     "y": 2029.35,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "chloroprene-polymerization": {
   "x": 1460.32,
   "y": 3079.48,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1500.32,
     "y": 3079.48
    },
    "cond": null,
    "box": {
     "x": 1468.32,
     "y": 3071.48,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "cumene-hydroperoxide-decomposition": {
   "x": 2134.03,
   "y": 1935.74,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2160.03,
     "y": 1935.74
    },
    "cond": null,
    "box": {
     "x": 2142.03,
     "y": 1927.74,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "cumene-oxidation": {
   "x": 1887.91,
   "y": 1871.5,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1913.91,
     "y": 1871.5
    },
    "cond": null,
    "box": {
     "x": 1895.91,
     "y": 1863.5,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "cysteine-oxidation": {
   "x": 1614.13,
   "y": 3140.12,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1640.13,
     "y": 3140.12
    },
    "cond": null,
    "box": {
     "x": 1622.13,
     "y": 3132.12,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "diazonium-phenol-coupling": {
   "x": 2401.74,
   "y": 2037.43,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2455.74,
     "y": 2037.43
    },
    "cond": null,
    "box": {
     "x": 2409.74,
     "y": 2029.43,
     "w": 92,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "diazonium-substitution-benzenediazonium-chloride-phenol": {
   "x": 2501.26,
   "y": 1817.41,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2527.26,
     "y": 1817.41
    },
    "cond": null,
    "box": {
     "x": 2509.26,
     "y": 1809.41,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "dibromoethene-bromine-addition": {
   "x": 1238.92,
   "y": 1054.88,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1264.92,
     "y": 1054.88
    },
    "cond": null,
    "box": {
     "x": 1246.92,
     "y": 1046.88,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethanal-oxidation-acetic": {
   "x": 1884.93,
   "y": 1501.94,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1910.93,
     "y": 1501.94
    },
    "cond": null,
    "box": {
     "x": 1892.93,
     "y": 1493.94,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethanal-reduction": {
   "x": 1484.5,
   "y": 1224.35,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1510.5,
     "y": 1224.35
    },
    "cond": null,
    "box": {
     "x": 1492.5,
     "y": 1216.35,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethanol-cuo-oxidation": {
   "x": 1547.72,
   "y": 1328.05,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1573.72,
     "y": 1328.05
    },
    "cond": null,
    "box": {
     "x": 1555.72,
     "y": 1320.05,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethanol-dehydration-ethene": {
   "x": 1874.98,
   "y": 1059.98,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1900.98,
     "y": 1059.98
    },
    "cond": null,
    "box": {
     "x": 1882.98,
     "y": 1051.98,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethanol-dehydration-ether": {
   "x": 2230.29,
   "y": 1244.8,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2256.29,
     "y": 1244.8
    },
    "cond": null,
    "box": {
     "x": 2238.29,
     "y": 1236.8,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethanol-dichromate-oxidation-acetic-acid": {
   "x": 1911.85,
   "y": 1427.92,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1937.85,
     "y": 1427.92
    },
    "cond": null,
    "box": {
     "x": 1919.85,
     "y": 1419.92,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethanol-dichromate-oxidation-ethanal": {
   "x": 1586.51,
   "y": 1235.26,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1612.51,
     "y": 1235.26
    },
    "cond": null,
    "box": {
     "x": 1594.51,
     "y": 1227.26,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethanol-oxidation-acetic": {
   "x": 1932.4,
   "y": 1282.14,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1958.4,
     "y": 1282.14
    },
    "cond": null,
    "box": {
     "x": 1940.4,
     "y": 1274.14,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethanol-oxidation-ethanal": {
   "x": 1445.71,
   "y": 1307.83,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1471.71,
     "y": 1307.83
    },
    "cond": null,
    "box": {
     "x": 1453.71,
     "y": 1299.83,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethanol-sodium": {
   "x": 1426.78,
   "y": 1133.42,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1480.78,
     "y": 1133.42
    },
    "cond": null,
    "box": {
     "x": 1434.78,
     "y": 1125.42,
     "w": 92,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethene-bromine-addition": {
   "x": 1937.6,
   "y": 821.35,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1963.6,
     "y": 821.35
    },
    "cond": null,
    "box": {
     "x": 1945.6,
     "y": 813.35,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethene-hydration": {
   "x": 1977.08,
   "y": 1060.02,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2003.08,
     "y": 1060.02
    },
    "cond": null,
    "box": {
     "x": 1985.08,
     "y": 1052.02,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethene-hydrogen-bromide": {
   "x": 2140.87,
   "y": 721.2,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2166.87,
     "y": 721.2
    },
    "cond": null,
    "box": {
     "x": 2148.87,
     "y": 713.2,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethene-hydrogenation": {
   "x": 2428.95,
   "y": 848.63,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2468.95,
     "y": 848.63
    },
    "cond": null,
    "box": {
     "x": 2436.95,
     "y": 840.63,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethene-polymerization": {
   "x": 2593.94,
   "y": 1463.28,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2633.94,
     "y": 1463.28
    },
    "cond": null,
    "box": {
     "x": 2601.94,
     "y": 1455.28,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethene-wacker-oxidation": {
   "x": 1842.46,
   "y": 985.95,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1868.46,
     "y": 985.95
    },
    "cond": null,
    "box": {
     "x": 1850.46,
     "y": 977.95,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethyl-acetate-hydrolysis": {
   "x": 2100.27,
   "y": 1254.69,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2140.27,
     "y": 1254.69
    },
    "cond": null,
    "box": {
     "x": 2108.27,
     "y": 1246.69,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethyl-acetate-saponification": {
   "x": 2013.88,
   "y": 1428.03,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2046.88,
     "y": 1428.03
    },
    "cond": null,
    "box": {
     "x": 2021.88,
     "y": 1420.03,
     "w": 50,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethyl-propionate-saponification": {
   "x": 1417.68,
   "y": 1465.25,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1450.68,
     "y": 1465.25
    },
    "cond": null,
    "box": {
     "x": 1425.68,
     "y": 1457.25,
     "w": 50,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethylbenzene-dehydrogenation": {
   "x": 2304.24,
   "y": 2704.45,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2330.24,
     "y": 2704.45
    },
    "cond": null,
    "box": {
     "x": 2312.24,
     "y": 2696.45,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethyne-acetic-acid-vinyl-acetate": {
   "x": 2070.33,
   "y": 1653.55,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2096.33,
     "y": 1653.55
    },
    "cond": null,
    "box": {
     "x": 2078.33,
     "y": 1645.55,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethyne-bromine-addition": {
   "x": 2079.08,
   "y": 1039.94,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2105.08,
     "y": 1039.94
    },
    "cond": null,
    "box": {
     "x": 2087.08,
     "y": 1031.94,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethyne-copper-acetylide": {
   "x": 2465.92,
   "y": 998.78,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2505.92,
     "y": 998.78
    },
    "cond": null,
    "box": {
     "x": 2473.92,
     "y": 990.78,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethyne-full-hydrogenation": {
   "x": 2468.06,
   "y": 1124.66,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2508.06,
     "y": 1124.66
    },
    "cond": null,
    "box": {
     "x": 2476.06,
     "y": 1116.66,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethyne-hydrogen-bromide": {
   "x": 2233.8,
   "y": 964.46,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2259.8,
     "y": 964.46
    },
    "cond": null,
    "box": {
     "x": 2241.8,
     "y": 956.46,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethyne-hydrogen-chloride": {
   "x": 2399.16,
   "y": 1817.41,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2425.16,
     "y": 1817.41
    },
    "cond": null,
    "box": {
     "x": 2407.16,
     "y": 1809.41,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethyne-partial-hydrogenation": {
   "x": 2328.31,
   "y": 1118.27,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2368.31,
     "y": 1118.27
    },
    "cond": null,
    "box": {
     "x": 2336.31,
     "y": 1110.27,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "ethyne-silver-acetylide": {
   "x": 2335.82,
   "y": 991.09,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2375.82,
     "y": 991.09
    },
    "cond": null,
    "box": {
     "x": 2343.82,
     "y": 983.09,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "formaldehyde-oxidation-formic": {
   "x": 1182.78,
   "y": 1703.83,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1208.78,
     "y": 1703.83
    },
    "cond": null,
    "box": {
     "x": 1190.78,
     "y": 1695.83,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "formic-acid-ethanol-esterification": {
   "x": 1061.07,
   "y": 1369.71,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1108.07,
     "y": 1369.71
    },
    "cond": null,
    "box": {
     "x": 1069.07,
     "y": 1361.71,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "formic-acid-methanol-esterification": {
   "x": 1176.18,
   "y": 1556.56,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1223.18,
     "y": 1556.56
    },
    "cond": null,
    "box": {
     "x": 1184.18,
     "y": 1548.56,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "fructose-base-isomerization": {
   "x": 2466.84,
   "y": 2256.87,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2499.84,
     "y": 2256.87
    },
    "cond": null,
    "box": {
     "x": 2474.84,
     "y": 2248.87,
     "w": 50,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "glucose-fermentation": {
   "x": 1963.58,
   "y": 1945.43,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1989.58,
     "y": 1945.43
    },
    "cond": null,
    "box": {
     "x": 1971.58,
     "y": 1937.43,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "glucose-reduction": {
   "x": 1836.89,
   "y": 2444.69,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1862.89,
     "y": 2444.69
    },
    "cond": null,
    "box": {
     "x": 1844.89,
     "y": 2436.69,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "glycerol-linoleic-esterification": {
   "x": 1377.68,
   "y": 1851.45,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1424.68,
     "y": 1851.45
    },
    "cond": null,
    "box": {
     "x": 1385.68,
     "y": 1843.45,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "glycerol-oleic-esterification": {
   "x": 1989.93,
   "y": 1871.41,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2036.93,
     "y": 1871.41
    },
    "cond": null,
    "box": {
     "x": 1997.93,
     "y": 1863.41,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "glycerol-palmitic-esterification": {
   "x": 1922.42,
   "y": 1723.47,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1969.42,
     "y": 1723.47
    },
    "cond": null,
    "box": {
     "x": 1930.42,
     "y": 1715.47,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "glycerol-stearic-esterification": {
   "x": 1449.33,
   "y": 1999.58,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1496.33,
     "y": 1999.58
    },
    "cond": null,
    "box": {
     "x": 1457.33,
     "y": 1991.58,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "glycine-alanine-peptide": {
   "x": 2181.46,
   "y": 2977.96,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2235.46,
     "y": 2977.96
    },
    "cond": null,
    "box": {
     "x": 2189.46,
     "y": 2969.96,
     "w": 92,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "glycine-glycine-peptide": {
   "x": 2346.54,
   "y": 3215.2,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2400.54,
     "y": 3215.2
    },
    "cond": null,
    "box": {
     "x": 2354.54,
     "y": 3207.2,
     "w": 92,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "glycylalanine-hydrolysis": {
   "x": 2226.61,
   "y": 3052.06,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2266.61,
     "y": 3052.06
    },
    "cond": null,
    "box": {
     "x": 2234.61,
     "y": 3044.06,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "glycylglycine-hydrolysis": {
   "x": 2356.71,
   "y": 3058.53,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2396.71,
     "y": 3058.53
    },
    "cond": null,
    "box": {
     "x": 2364.71,
     "y": 3050.53,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "iir-copolymerization": {
   "x": 1077,
   "y": 2468.55,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1117,
     "y": 2468.55
    },
    "cond": null,
    "box": {
     "x": 1085,
     "y": 2460.55,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "isobutene-hydrogen-chloride": {
   "x": 2172.98,
   "y": 2612.08,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2198.98,
     "y": 2612.08
    },
    "cond": null,
    "box": {
     "x": 2180.98,
     "y": 2604.08,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "lactose-hydrolysis": {
   "x": 2429.17,
   "y": 2404.99,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2469.17,
     "y": 2404.99
    },
    "cond": null,
    "box": {
     "x": 2437.17,
     "y": 2396.99,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "maleic-acid-anhydride": {
   "x": 2008.56,
   "y": 3293.19,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2034.56,
     "y": 3293.19
    },
    "cond": null,
    "box": {
     "x": 2016.56,
     "y": 3285.19,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "maleic-anhydride-hydrolysis": {
   "x": 2119.78,
   "y": 3346.42,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2159.78,
     "y": 3346.42
    },
    "cond": null,
    "box": {
     "x": 2127.78,
     "y": 3338.42,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "maltose-hydrolysis": {
   "x": 2517.18,
   "y": 2330.89,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2557.18,
     "y": 2330.89
    },
    "cond": null,
    "box": {
     "x": 2525.18,
     "y": 2322.89,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "melamine-resin-condensation": {
   "x": 1444.73,
   "y": 2322.13,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1477.73,
     "y": 2322.13
    },
    "cond": null,
    "box": {
     "x": 1452.73,
     "y": 2314.13,
     "w": 50,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "methane-chlorination": {
   "x": 1704.05,
   "y": 675.38,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1758.05,
     "y": 675.38
    },
    "cond": null,
    "box": {
     "x": 1712.05,
     "y": 667.38,
     "w": 92,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "methanol-cuo-oxidation": {
   "x": 1336.26,
   "y": 1766.54,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1362.26,
     "y": 1766.54
    },
    "cond": null,
    "box": {
     "x": 1344.26,
     "y": 1758.54,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "methanol-oxidation-formaldehyde": {
   "x": 1293.7,
   "y": 1692.44,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1319.7,
     "y": 1692.44
    },
    "cond": null,
    "box": {
     "x": 1301.7,
     "y": 1684.44,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "methanol-sodium": {
   "x": 1656.21,
   "y": 914.13,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1710.21,
     "y": 914.13
    },
    "cond": null,
    "box": {
     "x": 1664.21,
     "y": 906.13,
     "w": 92,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "methyl-salicylate-hydrolysis": {
   "x": 2291.44,
   "y": 1675.9,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2331.44,
     "y": 1675.9
    },
    "cond": null,
    "box": {
     "x": 2299.44,
     "y": 1667.9,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "mma-polymerization": {
   "x": 3014.42,
   "y": 2928.29,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 3054.42,
     "y": 2928.29
    },
    "cond": null,
    "box": {
     "x": 3022.42,
     "y": 2920.29,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "nitrobenzene-reduction": {
   "x": 1734.86,
   "y": 2372.34,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1760.86,
     "y": 2372.34
    },
    "cond": null,
    "box": {
     "x": 1742.86,
     "y": 2364.34,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "nylon6-from-aminoacid": {
   "x": 2046.03,
   "y": 2830.17,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2079.03,
     "y": 2830.17
    },
    "cond": null,
    "box": {
     "x": 2054.03,
     "y": 2822.17,
     "w": 50,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "nylon66-acid-chloride-condensation": {
   "x": 1730.21,
   "y": 2820.09,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1763.21,
     "y": 2820.09
    },
    "cond": null,
    "box": {
     "x": 1738.21,
     "y": 2812.09,
     "w": 50,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "nylon66-condensation": {
   "x": 1613.25,
   "y": 2789.09,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1646.25,
     "y": 2789.09
    },
    "cond": null,
    "box": {
     "x": 1621.25,
     "y": 2781.09,
     "w": 50,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "oleic-acid-neutralization": {
   "x": 2864.21,
   "y": 1920.14,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2890.21,
     "y": 1920.14
    },
    "cond": null,
    "box": {
     "x": 2872.21,
     "y": 1912.14,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "oxalic-acid-methanol-esterification": {
   "x": 1735.91,
   "y": 1501.59,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1782.91,
     "y": 1501.59
    },
    "cond": null,
    "box": {
     "x": 1743.91,
     "y": 1493.59,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "p-xylene-oxidation": {
   "x": 2422.64,
   "y": 2984.43,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2448.64,
     "y": 2984.43
    },
    "cond": null,
    "box": {
     "x": 2430.64,
     "y": 2976.43,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "pet-condensation": {
   "x": 2698.77,
   "y": 3019.7,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2731.77,
     "y": 3019.7
    },
    "cond": null,
    "box": {
     "x": 2706.77,
     "y": 3011.7,
     "w": 50,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "phenol-acetylation": {
   "x": 2767.65,
   "y": 1846.09,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2814.65,
     "y": 1846.09
    },
    "cond": null,
    "box": {
     "x": 2775.65,
     "y": 1838.09,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "phenol-acid-neutralization": {
   "x": 2559.75,
   "y": 2044.18,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2585.75,
     "y": 2044.18
    },
    "cond": null,
    "box": {
     "x": 2567.75,
     "y": 2036.18,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "phenol-bromination": {
   "x": 2321.9,
   "y": 2111.4,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2368.9,
     "y": 2111.4
    },
    "cond": null,
    "box": {
     "x": 2329.9,
     "y": 2103.4,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "phenol-nitration": {
   "x": 2462.36,
   "y": 1963.33,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2502.36,
     "y": 1963.33
    },
    "cond": null,
    "box": {
     "x": 2470.36,
     "y": 1955.33,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "phenol-phthalein": {
   "x": 2167.72,
   "y": 2035.2,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2193.72,
     "y": 2035.2
    },
    "cond": null,
    "box": {
     "x": 2175.72,
     "y": 2027.2,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "phenol-resin-condensation": {
   "x": 1694.95,
   "y": 2298.24,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1727.95,
     "y": 2298.24
    },
    "cond": null,
    "box": {
     "x": 1702.95,
     "y": 2290.24,
     "w": 50,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "phthalic-acid-anhydride": {
   "x": 2251.41,
   "y": 1745.77,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2277.41,
     "y": 1745.77
    },
    "cond": null,
    "box": {
     "x": 2259.41,
     "y": 1737.77,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "phthalic-anhydride-hydrolysis": {
   "x": 2269.14,
   "y": 1817.54,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2309.14,
     "y": 1817.54
    },
    "cond": null,
    "box": {
     "x": 2277.14,
     "y": 1809.54,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "polyacetylene-polymerization": {
   "x": 2452.24,
   "y": 1530.86,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2478.24,
     "y": 1530.86
    },
    "cond": null,
    "box": {
     "x": 2460.24,
     "y": 1522.86,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "propan-1-ol-oxidation": {
   "x": 1584.88,
   "y": 1062.15,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1610.88,
     "y": 1062.15
    },
    "cond": null,
    "box": {
     "x": 1592.88,
     "y": 1054.15,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "propan-2-ol-cuo-oxidation": {
   "x": 1930.16,
   "y": 1576.13,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1956.16,
     "y": 1576.13
    },
    "cond": null,
    "box": {
     "x": 1938.16,
     "y": 1568.13,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "propan-2-ol-iodoform": {
   "x": 1390.74,
   "y": 1391.25,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1416.74,
     "y": 1391.25
    },
    "cond": null,
    "box": {
     "x": 1398.74,
     "y": 1383.25,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "propan-2-ol-oxidation": {
   "x": 1987.03,
   "y": 1502.03,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2013.03,
     "y": 1502.03
    },
    "cond": null,
    "box": {
     "x": 1995.03,
     "y": 1494.03,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "propanal-oxidation": {
   "x": 1830.3,
   "y": 1282.24,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1856.3,
     "y": 1282.24
    },
    "cond": null,
    "box": {
     "x": 1838.3,
     "y": 1274.24,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "propanal-reduction": {
   "x": 1656.53,
   "y": 988.15,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1682.53,
     "y": 988.15
    },
    "cond": null,
    "box": {
     "x": 1664.53,
     "y": 980.15,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "propene-hydration": {
   "x": 1893.31,
   "y": 1134.08,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1919.31,
     "y": 1134.08
    },
    "cond": null,
    "box": {
     "x": 1901.31,
     "y": 1126.08,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "propene-hydrogenation": {
   "x": 1501.77,
   "y": 762.33,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1541.77,
     "y": 762.33
    },
    "cond": null,
    "box": {
     "x": 1509.77,
     "y": 754.33,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "propene-polymerization": {
   "x": 2236.04,
   "y": 1963.42,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2276.04,
     "y": 1963.42
    },
    "cond": null,
    "box": {
     "x": 2244.04,
     "y": 1955.42,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "propionic-acid-ethanol-esterification": {
   "x": 1301.69,
   "y": 1317.24,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1348.69,
     "y": 1317.24
    },
    "cond": null,
    "box": {
     "x": 1309.69,
     "y": 1309.24,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "propionic-acid-methanol-esterification": {
   "x": 1612.14,
   "y": 1575.63,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1659.14,
     "y": 1575.63
    },
    "cond": null,
    "box": {
     "x": 1620.14,
     "y": 1567.63,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "propyne-hydration": {
   "x": 2197.55,
   "y": 1170.7,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2223.55,
     "y": 1170.7
    },
    "cond": null,
    "box": {
     "x": 2205.55,
     "y": 1162.7,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "protein-hydrolysis": {
   "x": 1253.07,
   "y": 3191.3,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1293.07,
     "y": 3191.3
    },
    "cond": null,
    "box": {
     "x": 1261.07,
     "y": 3183.3,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "pva-formalization": {
   "x": 2275,
   "y": 2554.77,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2301,
     "y": 2554.77
    },
    "cond": null,
    "box": {
     "x": 2283,
     "y": 2546.77,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "pvac-hydrolysis": {
   "x": 2711.34,
   "y": 2257.11,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2751.34,
     "y": 2257.11
    },
    "cond": null,
    "box": {
     "x": 2719.34,
     "y": 2249.11,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "salicylic-acid-acetylation": {
   "x": 2753.77,
   "y": 1535.28,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2800.77,
     "y": 1535.28
    },
    "cond": null,
    "box": {
     "x": 2761.77,
     "y": 1527.28,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "salicylic-acid-methyl-esterification": {
   "x": 2213.84,
   "y": 1601.8,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2260.84,
     "y": 1601.8
    },
    "cond": null,
    "box": {
     "x": 2221.84,
     "y": 1593.8,
     "w": 78,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "sodium-acetate-decarboxylation": {
   "x": 1598.97,
   "y": 1136.25,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1624.97,
     "y": 1136.25
    },
    "cond": null,
    "box": {
     "x": 1606.97,
     "y": 1128.25,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "sodium-benzenesulfonate-alkali-fusion": {
   "x": 2999.89,
   "y": 2085.34,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 3025.89,
     "y": 2085.34
    },
    "cond": null,
    "box": {
     "x": 3007.89,
     "y": 2077.34,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "sodium-benzoate-acidification": {
   "x": 3062.32,
   "y": 2202.27,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 3088.32,
     "y": 2202.27
    },
    "cond": null,
    "box": {
     "x": 3070.32,
     "y": 2194.27,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "sodium-phenoxide-acidification": {
   "x": 2603.29,
   "y": 1858.09,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2629.29,
     "y": 1858.09
    },
    "cond": null,
    "box": {
     "x": 2611.29,
     "y": 1850.09,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "sodium-phenoxide-carboxylation": {
   "x": 2144.78,
   "y": 2320.64,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2198.78,
     "y": 2320.64
    },
    "cond": null,
    "box": {
     "x": 2152.78,
     "y": 2312.64,
     "w": 92,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "sodium-salicylate-acidification": {
   "x": 2065.62,
   "y": 2009.76,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2091.62,
     "y": 2009.76
    },
    "cond": null,
    "box": {
     "x": 2073.62,
     "y": 2001.76,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "starch-hydrolysis-glucose": {
   "x": 1968.99,
   "y": 2538.76,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2008.99,
     "y": 2538.76
    },
    "cond": null,
    "box": {
     "x": 1976.99,
     "y": 2530.76,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "starch-hydrolysis-maltose": {
   "x": 2042.88,
   "y": 2612.86,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2082.88,
     "y": 2612.86
    },
    "cond": null,
    "box": {
     "x": 2050.88,
     "y": 2604.86,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "stearic-acid-neutralization": {
   "x": 1406.94,
   "y": 2173.98,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1432.94,
     "y": 2173.98
    },
    "cond": null,
    "box": {
     "x": 1414.94,
     "y": 2165.98,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "styrene-butadiene-copolymerization": {
   "x": 2747.04,
   "y": 2732.41,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2787.04,
     "y": 2732.41
    },
    "cond": null,
    "box": {
     "x": 2755.04,
     "y": 2724.41,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "styrene-polymerization": {
   "x": 2660.92,
   "y": 2850.18,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2700.92,
     "y": 2850.18
    },
    "cond": null,
    "box": {
     "x": 2668.92,
     "y": 2842.18,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "sucrose-hydrolysis": {
   "x": 2139.49,
   "y": 2538.73,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2179.49,
     "y": 2538.73
    },
    "cond": null,
    "box": {
     "x": 2147.49,
     "y": 2530.73,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "tetrafluoroethylene-polymerization": {
   "x": 1737.19,
   "y": 3093.75,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1777.19,
     "y": 3093.75
    },
    "cond": null,
    "box": {
     "x": 1745.19,
     "y": 3085.75,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "toluene-oxidation-benzoic-acid": {
   "x": 2985.07,
   "y": 2512.4,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 3011.07,
     "y": 2512.4
    },
    "cond": null,
    "box": {
     "x": 2993.07,
     "y": 2504.4,
     "w": 36,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "triglyceride-hydrolysis-trilinolein-glycerol-linoleic-acid": {
   "x": 1401.8,
   "y": 1925.48,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1441.8,
     "y": 1925.48
    },
    "cond": null,
    "box": {
     "x": 1409.8,
     "y": 1917.48,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "triglyceride-hydrolysis-tripalmitin-glycerol-palmitic-acid": {
   "x": 1946.84,
   "y": 1797.57,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1986.84,
     "y": 1797.57
    },
    "cond": null,
    "box": {
     "x": 1954.84,
     "y": 1789.57,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "triolein-hydrogenation": {
   "x": 1840.67,
   "y": 2298.38,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1880.67,
     "y": 2298.38
    },
    "cond": null,
    "box": {
     "x": 1848.67,
     "y": 2290.38,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "triolein-saponification": {
   "x": 2237.05,
   "y": 1889.32,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2270.05,
     "y": 1889.32
    },
    "cond": null,
    "box": {
     "x": 2245.05,
     "y": 1881.32,
     "w": 50,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "tripalmitin-saponification": {
   "x": 1474.38,
   "y": 1777.44,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1507.38,
     "y": 1777.44
    },
    "cond": null,
    "box": {
     "x": 1482.38,
     "y": 1769.44,
     "w": 50,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "tristearin-hydrolysis": {
   "x": 1510.09,
   "y": 2073.61,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1550.09,
     "y": 2073.61
    },
    "cond": null,
    "box": {
     "x": 1518.09,
     "y": 2065.61,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "tristearin-saponification": {
   "x": 1509.04,
   "y": 2191.68,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 1542.04,
     "y": 2191.68
    },
    "cond": null,
    "box": {
     "x": 1517.04,
     "y": 2183.68,
     "w": 50,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "urea-resin-condensation": {
   "x": 1039.67,
   "y": 1965.03,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 1072.67,
     "y": 1965.03
    },
    "cond": null,
    "box": {
     "x": 1047.67,
     "y": 1957.03,
     "w": 50,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "vinyl-acetate-polymerization": {
   "x": 2216.32,
   "y": 2464.63,
   "tier": "secondary",
   "label": {
    "side": "E",
    "type": {
     "x": 2256.32,
     "y": 2464.63
    },
    "cond": null,
    "box": {
     "x": 2224.32,
     "y": 2456.63,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  },
  "vinyl-chloride-polymerization": {
   "x": 2551.05,
   "y": 2560.15,
   "tier": "primary",
   "label": {
    "side": "E",
    "type": {
     "x": 2591.05,
     "y": 2560.15
    },
    "cond": null,
    "box": {
     "x": 2559.05,
     "y": 2552.15,
     "w": 64,
     "h": 16
    },
    "anchor": "center",
    "leader": null
   }
  }
 },
 "routes": {
  "methane-chlorination|in|methane": {
   "reaction": "methane-chlorination",
   "dir": "in",
   "compound": "methane",
   "tier": "primary",
   "points": [
    [
     1471.96,
     1009.71
    ],
    [
     1471.96,
     993.71
    ],
    [
     1440,
     980
    ],
    [
     1450,
     930
    ],
    [
     1550,
     800
    ],
    [
     1610,
     790
    ],
    [
     1668.05,
     675.38
    ],
    [
     1676.05,
     675.38
    ],
    [
     1704.05,
     675.38
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "methane-chlorination|out|chloromethane": {
   "reaction": "methane-chlorination",
   "dir": "out",
   "compound": "chloromethane",
   "tier": "primary",
   "points": [
    [
     1996.16,
     576.37
    ],
    [
     1980.16,
     576.37
    ],
    [
     1960,
     570
    ],
    [
     1830,
     570
    ],
    [
     1668.05,
     675.38
    ],
    [
     1676.05,
     675.38
    ],
    [
     1704.05,
     675.38
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethene-bromine-addition|in|ethene": {
   "reaction": "ethene-bromine-addition",
   "dir": "in",
   "compound": "ethene",
   "tier": "primary",
   "points": [
    [
     2029.7,
     877.43
    ],
    [
     2013.7,
     877.43
    ],
    [
     1901.6,
     821.35
    ],
    [
     1909.6,
     821.35
    ],
    [
     1937.6,
     821.35
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethene-bromine-addition|out|1,2-dibromoethane": {
   "reaction": "ethene-bromine-addition",
   "dir": "out",
   "compound": "1,2-dibromoethane",
   "tier": "primary",
   "points": [
    [
     1741.6,
     616.78
    ],
    [
     1757.6,
     616.78
    ],
    [
     1937.6,
     616.78
    ],
    [
     1937.6,
     821.35
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethene-hydrogen-bromide|in|ethene": {
   "reaction": "ethene-hydrogen-bromide",
   "dir": "in",
   "compound": "ethene",
   "tier": "primary",
   "points": [
    [
     2140.87,
     874.71
    ],
    [
     2140.87,
     858.71
    ],
    [
     2070,
     850
    ],
    [
     2080,
     790
    ],
    [
     2100,
     760
    ],
    [
     2104.87,
     721.2
    ],
    [
     2112.87,
     721.2
    ],
    [
     2140.87,
     721.2
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethene-hydrogen-bromide|out|bromoethane": {
   "reaction": "ethene-hydrogen-bromide",
   "dir": "out",
   "compound": "bromoethane",
   "tier": "primary",
   "points": [
    [
     1968.06,
     606.79
    ],
    [
     1984.06,
     606.79
    ],
    [
     2104.87,
     721.2
    ],
    [
     2112.87,
     721.2
    ],
    [
     2140.87,
     721.2
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethene-hydrogenation|in|ethene": {
   "reaction": "ethene-hydrogenation",
   "dir": "in",
   "compound": "ethene",
   "tier": "primary",
   "points": [
    [
     2205.7,
     877.43
    ],
    [
     2221.7,
     877.4300000000001
    ],
    [
     2240,
     840
    ],
    [
     2390,
     840
    ],
    [
     2392.95,
     848.63
    ],
    [
     2400.95,
     848.63
    ],
    [
     2428.95,
     848.63
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethene-hydrogenation|out|ethane": {
   "reaction": "ethene-hydrogenation",
   "dir": "out",
   "compound": "ethane",
   "tier": "primary",
   "points": [
    [
     2552.34,
     911.4
    ],
    [
     2536.34,
     911.4
    ],
    [
     2392.95,
     848.63
    ],
    [
     2400.95,
     848.63
    ],
    [
     2428.95,
     848.63
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethene-hydration|in|ethene": {
   "reaction": "ethene-hydration",
   "dir": "in",
   "compound": "ethene",
   "tier": "primary",
   "points": [
    [
     2043.78,
     908.71
    ],
    [
     2043.78,
     924.71
    ],
    [
     2060,
     940
    ],
    [
     2060,
     1000
    ],
    [
     1941.08,
     1060.02
    ],
    [
     1949.08,
     1060.02
    ],
    [
     1977.08,
     1060.02
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethene-hydration|out|ethanol": {
   "reaction": "ethene-hydration",
   "dir": "out",
   "compound": "ethanol",
   "tier": "primary",
   "points": [
    [
     1843.72,
     1349.51
    ],
    [
     1843.72,
     1333.51
    ],
    [
     1900,
     1310
    ],
    [
     1920,
     1250
    ],
    [
     1960,
     1170
    ],
    [
     1960,
     1100
    ],
    [
     1941.08,
     1060.02
    ],
    [
     1949.08,
     1060.02
    ],
    [
     1977.08,
     1060.02
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propene-hydrogenation|in|propene": {
   "reaction": "propene-hydrogenation",
   "dir": "in",
   "compound": "propene",
   "tier": "primary",
   "points": [
    [
     1804.31,
     879.84
    ],
    [
     1788.31,
     879.84
    ],
    [
     1501.77,
     879.84
    ],
    [
     1501.77,
     762.33
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propene-hydrogenation|out|propane": {
   "reaction": "propene-hydrogenation",
   "dir": "out",
   "compound": "propane",
   "tier": "primary",
   "points": [
    [
     1300.71,
     862.59
    ],
    [
     1316.71,
     862.59
    ],
    [
     1316.71,
     762.33
    ],
    [
     1501.77,
     762.33
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propene-hydration|in|propene": {
   "reaction": "propene-hydration",
   "dir": "in",
   "compound": "propene",
   "tier": "primary",
   "points": [
    [
     1905.31,
     911.12
    ],
    [
     1905.31,
     927.12
    ],
    [
     1910,
     1020
    ],
    [
     1860,
     1030
    ],
    [
     1857.31,
     1134.08
    ],
    [
     1865.31,
     1134.08
    ],
    [
     1893.31,
     1134.08
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propene-hydration|out|propan-2-ol": {
   "reaction": "propene-hydration",
   "dir": "out",
   "compound": "propan-2-ol",
   "tier": "primary",
   "points": [
    [
     1852.87,
     1411.55
    ],
    [
     1852.87,
     1395.55
    ],
    [
     1860,
     1340
    ],
    [
     1810,
     1310
    ],
    [
     1820,
     1210
    ],
    [
     1857.31,
     1134.08
    ],
    [
     1865.31,
     1134.08
    ],
    [
     1893.31,
     1134.08
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-partial-hydrogenation|in|ethyne": {
   "reaction": "ethyne-partial-hydrogenation",
   "dir": "in",
   "compound": "ethyne",
   "tier": "primary",
   "points": [
    [
     2330.39,
     1218.86
    ],
    [
     2330.39,
     1202.86
    ],
    [
     2292.31,
     1118.27
    ],
    [
     2300.31,
     1118.27
    ],
    [
     2328.31,
     1118.27
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-partial-hydrogenation|out|ethene": {
   "reaction": "ethyne-partial-hydrogenation",
   "dir": "out",
   "compound": "ethene",
   "tier": "primary",
   "points": [
    [
     2191.62,
     908.71
    ],
    [
     2191.62,
     924.71
    ],
    [
     2220,
     1000
    ],
    [
     2280,
     1010
    ],
    [
     2292.31,
     1118.27
    ],
    [
     2300.31,
     1118.27
    ],
    [
     2328.31,
     1118.27
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-full-hydrogenation|in|ethyne": {
   "reaction": "ethyne-full-hydrogenation",
   "dir": "in",
   "compound": "ethyne",
   "tier": "primary",
   "points": [
    [
     2435.51,
     1218.86
    ],
    [
     2435.51,
     1202.86
    ],
    [
     2432.06,
     1124.66
    ],
    [
     2440.06,
     1124.66
    ],
    [
     2468.06,
     1124.66
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-full-hydrogenation|out|ethane": {
   "reaction": "ethyne-full-hydrogenation",
   "dir": "out",
   "compound": "ethane",
   "tier": "primary",
   "points": [
    [
     2563.22,
     942.68
    ],
    [
     2563.22,
     958.68
    ],
    [
     2432.06,
     958.68
    ],
    [
     2432.06,
     1124.66
    ],
    [
     2440.06,
     1124.66
    ],
    [
     2468.06,
     1124.66
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-hydrogen-bromide|in|ethyne": {
   "reaction": "ethyne-hydrogen-bromide",
   "dir": "in",
   "compound": "ethyne",
   "tier": "primary",
   "points": [
    [
     2333.27,
     1218.86
    ],
    [
     2333.27,
     1202.86
    ],
    [
     2270,
     1000
    ],
    [
     2197.8,
     964.46
    ],
    [
     2205.8,
     964.46
    ],
    [
     2233.8,
     964.46
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-hydrogen-bromide|out|bromoethene": {
   "reaction": "ethyne-hydrogen-bromide",
   "dir": "out",
   "compound": "bromoethene",
   "tier": "primary",
   "points": [
    [
     2092.77,
     762.77
    ],
    [
     2108.77,
     762.77
    ],
    [
     2233.8,
     762.77
    ],
    [
     2233.8,
     964.46
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-silver-acetylide|in|ethyne": {
   "reaction": "ethyne-silver-acetylide",
   "dir": "in",
   "compound": "ethyne",
   "tier": "primary",
   "points": [
    [
     2335.82,
     1218.86
    ],
    [
     2335.82,
     1202.86
    ],
    [
     2299.82,
     1202.86
    ],
    [
     2299.82,
     991.09
    ],
    [
     2307.82,
     991.09
    ],
    [
     2335.82,
     991.09
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-silver-acetylide|out|silver-acetylide": {
   "reaction": "ethyne-silver-acetylide",
   "dir": "out",
   "compound": "silver-acetylide",
   "tier": "primary",
   "points": [
    [
     2335.82,
     707.12
    ],
    [
     2335.82,
     723.12
    ],
    [
     2390,
     860
    ],
    [
     2380,
     900
    ],
    [
     2299.82,
     991.09
    ],
    [
     2307.82,
     991.09
    ],
    [
     2335.82,
     991.09
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-copper-acetylide|in|ethyne": {
   "reaction": "ethyne-copper-acetylide",
   "dir": "in",
   "compound": "ethyne",
   "tier": "primary",
   "points": [
    [
     2447.51,
     1218.86
    ],
    [
     2447.51,
     1202.86
    ],
    [
     2429.92,
     998.78
    ],
    [
     2437.92,
     998.78
    ],
    [
     2465.92,
     998.78
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-copper-acetylide|out|copper-i-acetylide": {
   "reaction": "ethyne-copper-acetylide",
   "dir": "out",
   "compound": "copper-i-acetylide",
   "tier": "primary",
   "points": [
    [
     2515.53,
     756.76
    ],
    [
     2515.53,
     772.76
    ],
    [
     2530,
     880
    ],
    [
     2429.92,
     998.78
    ],
    [
     2437.92,
     998.78
    ],
    [
     2465.92,
     998.78
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-dehydration-ethene|in|ethanol": {
   "reaction": "ethanol-dehydration-ethene",
   "dir": "in",
   "compound": "ethanol",
   "tier": "primary",
   "points": [
    [
     1834.76,
     1349.51
    ],
    [
     1834.76,
     1333.51
    ],
    [
     1810,
     1300
    ],
    [
     1830,
     1150
    ],
    [
     1838.98,
     1059.98
    ],
    [
     1846.98,
     1059.98
    ],
    [
     1874.98,
     1059.98
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-dehydration-ethene|out|ethene": {
   "reaction": "ethanol-dehydration-ethene",
   "dir": "out",
   "compound": "ethene",
   "tier": "primary",
   "points": [
    [
     2029.7,
     905.99
    ],
    [
     2013.7,
     905.99
    ],
    [
     1910,
     950
    ],
    [
     1910,
     1020
    ],
    [
     1838.98,
     1059.98
    ],
    [
     1846.98,
     1059.98
    ],
    [
     1874.98,
     1059.98
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-dehydration-ether|in|ethanol": {
   "reaction": "ethanol-dehydration-ether",
   "dir": "in",
   "compound": "ethanol",
   "tier": "primary",
   "points": [
    [
     1851.72,
     1364.23
    ],
    [
     1867.72,
     1364.23
    ],
    [
     1880,
     1330
    ],
    [
     2020,
     1310
    ],
    [
     2070,
     1290
    ],
    [
     2200,
     1290
    ],
    [
     2230.29,
     1244.8
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-dehydration-ether|out|diethyl-ether": {
   "reaction": "ethanol-dehydration-ether",
   "dir": "out",
   "compound": "diethyl-ether",
   "tier": "primary",
   "points": [
    [
     2789.92,
     1112.34
    ],
    [
     2773.92,
     1112.34
    ],
    [
     2194.29,
     1244.8
    ],
    [
     2202.29,
     1244.8
    ],
    [
     2230.29,
     1244.8
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzene-chlorine-addition|in|benzene": {
   "reaction": "benzene-chlorine-addition",
   "dir": "in",
   "compound": "benzene",
   "tier": "primary",
   "points": [
    [
     2015.82,
     1340.92
    ],
    [
     2031.82,
     1340.92
    ],
    [
     2090,
     1220
    ],
    [
     2150,
     1190
    ],
    [
     2180,
     1140
    ],
    [
     2310,
     1090
    ],
    [
     2567.37,
     1081.24
    ],
    [
     2575.37,
     1081.24
    ],
    [
     2603.37,
     1081.24
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzene-chlorine-addition|out|hexachlorocyclohexane": {
   "reaction": "benzene-chlorine-addition",
   "dir": "out",
   "compound": "hexachlorocyclohexane",
   "tier": "primary",
   "points": [
    [
     2727.82,
     944.22
    ],
    [
     2711.82,
     944.22
    ],
    [
     2567.37,
     1081.24
    ],
    [
     2575.37,
     1081.24
    ],
    [
     2603.37,
     1081.24
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "methanol-oxidation-formaldehyde|in|methanol": {
   "reaction": "methanol-oxidation-formaldehyde",
   "dir": "in",
   "compound": "methanol",
   "tier": "primary",
   "points": [
    [
     1370.12,
     1614.54
    ],
    [
     1354.12,
     1614.54
    ],
    [
     1257.7,
     1692.44
    ],
    [
     1265.7,
     1692.44
    ],
    [
     1293.7,
     1692.44
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "methanol-oxidation-formaldehyde|out|formaldehyde": {
   "reaction": "methanol-oxidation-formaldehyde",
   "dir": "out",
   "compound": "formaldehyde",
   "tier": "primary",
   "points": [
    [
     1293.7,
     1959.48
    ],
    [
     1293.7,
     1943.48
    ],
    [
     1340,
     1900
    ],
    [
     1330,
     1840
    ],
    [
     1257.7,
     1692.44
    ],
    [
     1265.7,
     1692.44
    ],
    [
     1293.7,
     1692.44
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "formaldehyde-oxidation-formic|in|formaldehyde": {
   "reaction": "formaldehyde-oxidation-formic",
   "dir": "in",
   "compound": "formaldehyde",
   "tier": "primary",
   "points": [
    [
     1228.42,
     1959.48
    ],
    [
     1228.42,
     1943.48
    ],
    [
     1110,
     1850
    ],
    [
     1110,
     1780
    ],
    [
     1146.78,
     1703.83
    ],
    [
     1154.78,
     1703.83
    ],
    [
     1182.78,
     1703.83
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "formaldehyde-oxidation-formic|out|formic-acid": {
   "reaction": "formaldehyde-oxidation-formic",
   "dir": "out",
   "compound": "formic-acid",
   "tier": "primary",
   "points": [
    [
     1117.29,
     1592.83
    ],
    [
     1117.29,
     1608.83
    ],
    [
     1146.78,
     1703.83
    ],
    [
     1154.78,
     1703.83
    ],
    [
     1182.78,
     1703.83
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-oxidation-ethanal|in|ethanol": {
   "reaction": "ethanol-oxidation-ethanal",
   "dir": "in",
   "compound": "ethanol",
   "tier": "primary",
   "points": [
    [
     1639.72,
     1364.23
    ],
    [
     1623.72,
     1364.23
    ],
    [
     1455.33,
     1352.81
    ],
    [
     1445.71,
     1307.83
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-oxidation-ethanal|out|ethanal": {
   "reaction": "ethanol-oxidation-ethanal",
   "dir": "out",
   "compound": "ethanal",
   "tier": "primary",
   "points": [
    [
     1678.61,
     1223.54
    ],
    [
     1662.61,
     1223.54
    ],
    [
     1650,
     1270
    ],
    [
     1420,
     1300
    ],
    [
     1409.71,
     1307.83
    ],
    [
     1417.71,
     1307.83
    ],
    [
     1445.71,
     1307.83
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanal-oxidation-acetic|in|ethanal": {
   "reaction": "ethanal-oxidation-acetic",
   "dir": "in",
   "compound": "ethanal",
   "tier": "primary",
   "points": [
    [
     1803.73,
     1226.26
    ],
    [
     1803.73,
     1242.26
    ],
    [
     1820,
     1330
    ],
    [
     1860,
     1350
    ],
    [
     1870,
     1450
    ],
    [
     1848.93,
     1501.94
    ],
    [
     1856.93,
     1501.94
    ],
    [
     1884.93,
     1501.94
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanal-oxidation-acetic|out|acetic-acid": {
   "reaction": "ethanal-oxidation-acetic",
   "dir": "out",
   "compound": "acetic-acid",
   "tier": "primary",
   "points": [
    [
     2119.9,
     1467.38
    ],
    [
     2103.9,
     1467.38
    ],
    [
     1848.93,
     1467.38
    ],
    [
     1848.93,
     1501.94
    ],
    [
     1856.93,
     1501.94
    ],
    [
     1884.93,
     1501.94
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-oxidation-acetic|in|ethanol": {
   "reaction": "ethanol-oxidation-acetic",
   "dir": "in",
   "compound": "ethanol",
   "tier": "secondary",
   "points": [
    [
     1851.72,
     1352.23
    ],
    [
     1867.72,
     1352.23
    ],
    [
     1880,
     1330
    ],
    [
     1900,
     1310
    ],
    [
     1896.4,
     1282.14
    ],
    [
     1904.4,
     1282.14
    ],
    [
     1932.4,
     1282.14
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-oxidation-acetic|out|acetic-acid": {
   "reaction": "ethanol-oxidation-acetic",
   "dir": "out",
   "compound": "acetic-acid",
   "tier": "secondary",
   "points": [
    [
     2119.9,
     1444.1
    ],
    [
     2103.9,
     1444.1000000000001
    ],
    [
     2090,
     1390
    ],
    [
     2010,
     1330
    ],
    [
     1896.4,
     1282.14
    ],
    [
     1904.4,
     1282.14
    ],
    [
     1932.4,
     1282.14
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propan-1-ol-oxidation|in|propan-1-ol": {
   "reaction": "propan-1-ol-oxidation",
   "dir": "in",
   "compound": "propan-1-ol",
   "tier": "secondary",
   "points": [
    [
     1576.95,
     981.61
    ],
    [
     1576.95,
     997.61
    ],
    [
     1548.88,
     1062.15
    ],
    [
     1556.88,
     1062.15
    ],
    [
     1584.88,
     1062.15
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propan-1-ol-oxidation|out|propanal": {
   "reaction": "propan-1-ol-oxidation",
   "dir": "out",
   "compound": "propanal",
   "tier": "secondary",
   "points": [
    [
     1690.97,
     1120.25
    ],
    [
     1674.97,
     1120.25
    ],
    [
     1610.31,
     1007.8
    ],
    [
     1584.88,
     1062.15
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propan-2-ol-oxidation|in|propan-2-ol": {
   "reaction": "propan-2-ol-oxidation",
   "dir": "in",
   "compound": "propan-2-ol",
   "tier": "primary",
   "points": [
    [
     1863.75,
     1442.83
    ],
    [
     1879.75,
     1442.83
    ],
    [
     1920,
     1470
    ],
    [
     1950,
     1470
    ],
    [
     1951.03,
     1502.03
    ],
    [
     1959.03,
     1502.03
    ],
    [
     1987.03,
     1502.03
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propan-2-ol-oxidation|out|acetone": {
   "reaction": "propan-2-ol-oxidation",
   "dir": "out",
   "compound": "acetone",
   "tier": "primary",
   "points": [
    [
     2119.91,
     1394.46
    ],
    [
     2103.91,
     1394.46
    ],
    [
     1987.03,
     1394.46
    ],
    [
     1987.03,
     1502.03
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "butan-1-ol-oxidation|in|butan-1-ol": {
   "reaction": "butan-1-ol-oxidation",
   "dir": "in",
   "compound": "butan-1-ol",
   "tier": "secondary",
   "points": [
    [
     3002.47,
     1248.68
    ],
    [
     3018.47,
     1248.68
    ],
    [
     3023.48,
     1198.3
    ],
    [
     3031.48,
     1198.3
    ],
    [
     3059.48,
     1198.3
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "butan-1-ol-oxidation|out|butanal": {
   "reaction": "butan-1-ol-oxidation",
   "dir": "out",
   "compound": "butanal",
   "tier": "secondary",
   "points": [
    [
     3059.48,
     1364.08
    ],
    [
     3059.48,
     1348.08
    ],
    [
     3023.48,
     1198.3
    ],
    [
     3031.48,
     1198.3
    ],
    [
     3059.48,
     1198.3
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propanal-oxidation|in|propanal": {
   "reaction": "propanal-oxidation",
   "dir": "in",
   "compound": "propanal",
   "tier": "secondary",
   "points": [
    [
     1816.09,
     1151.53
    ],
    [
     1816.09,
     1167.53
    ],
    [
     1830.3,
     1282.24
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propanal-oxidation|out|propionic-acid": {
   "reaction": "propanal-oxidation",
   "dir": "out",
   "compound": "propionic-acid",
   "tier": "secondary",
   "points": [
    [
     1699.71,
     1414.27
    ],
    [
     1715.71,
     1414.27
    ],
    [
     1760,
     1390
    ],
    [
     1860,
     1390
    ],
    [
     1860,
     1340
    ],
    [
     1794.3,
     1282.24
    ],
    [
     1802.3,
     1282.24
    ],
    [
     1830.3,
     1282.24
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzyl-alcohol-oxidation|in|benzyl-alcohol": {
   "reaction": "benzyl-alcohol-oxidation",
   "dir": "in",
   "compound": "benzyl-alcohol",
   "tier": "primary",
   "points": [
    [
     1089.35,
     2664.05
    ],
    [
     1105.35,
     2664.05
    ],
    [
     1138.97,
     2737.55
    ],
    [
     1146.97,
     2737.55
    ],
    [
     1174.97,
     2737.55
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzyl-alcohol-oxidation|out|benzaldehyde": {
   "reaction": "benzyl-alcohol-oxidation",
   "dir": "out",
   "compound": "benzaldehyde",
   "tier": "primary",
   "points": [
    [
     1409.56,
     2737.55
    ],
    [
     1393.56,
     2737.55
    ],
    [
     1164.7,
     2715.86
    ],
    [
     1174.97,
     2737.55
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzaldehyde-oxidation|in|benzaldehyde": {
   "reaction": "benzaldehyde-oxidation",
   "dir": "in",
   "compound": "benzaldehyde",
   "tier": "primary",
   "points": [
    [
     1545.56,
     2745.99
    ],
    [
     1561.56,
     2745.99
    ],
    [
     1780.23,
     2745.99
    ],
    [
     1788.23,
     2745.99
    ],
    [
     1816.23,
     2745.99
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzaldehyde-oxidation|out|benzoic-acid": {
   "reaction": "benzaldehyde-oxidation",
   "dir": "out",
   "compound": "benzoic-acid",
   "tier": "primary",
   "points": [
    [
     2979.68,
     2366.88
    ],
    [
     2963.68,
     2366.88
    ],
    [
     2950,
     2380
    ],
    [
     2840,
     2450
    ],
    [
     2640,
     2510
    ],
    [
     2520,
     2530
    ],
    [
     2510,
     2580
    ],
    [
     2280,
     2620
    ],
    [
     2230,
     2650
    ],
    [
     1980,
     2660
    ],
    [
     1830,
     2730
    ],
    [
     1820,
     2740
    ],
    [
     1816.23,
     2745.99
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanal-reduction|in|ethanal": {
   "reaction": "ethanal-reduction",
   "dir": "in",
   "compound": "ethanal",
   "tier": "secondary",
   "points": [
    [
     1678.61,
     1211.54
    ],
    [
     1662.61,
     1211.54
    ],
    [
     1630,
     1200
    ],
    [
     1460,
     1210
    ],
    [
     1448.5,
     1224.35
    ],
    [
     1456.5,
     1224.35
    ],
    [
     1484.5,
     1224.35
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanal-reduction|out|ethanol": {
   "reaction": "ethanal-reduction",
   "dir": "out",
   "compound": "ethanol",
   "tier": "secondary",
   "points": [
    [
     1639.72,
     1357.51
    ],
    [
     1623.72,
     1357.51
    ],
    [
     1610,
     1290
    ],
    [
     1448.5,
     1224.35
    ],
    [
     1456.5,
     1224.35
    ],
    [
     1484.5,
     1224.35
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetone-reduction|in|acetone": {
   "reaction": "acetone-reduction",
   "dir": "in",
   "compound": "acetone",
   "tier": "secondary",
   "points": [
    [
     2119.91,
     1414.46
    ],
    [
     2103.91,
     1414.46
    ],
    [
     2090,
     1470
    ],
    [
     2050,
     1540
    ],
    [
     2010,
     1550
    ],
    [
     1990,
     1620
    ],
    [
     1932.23,
     1649.99
    ],
    [
     1940.23,
     1649.99
    ],
    [
     1968.23,
     1649.99
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetone-reduction|out|propan-2-ol": {
   "reaction": "acetone-reduction",
   "dir": "out",
   "compound": "propan-2-ol",
   "tier": "secondary",
   "points": [
    [
     1855.75,
     1445.55
    ],
    [
     1855.75,
     1461.55
    ],
    [
     1870,
     1530
    ],
    [
     1932.23,
     1649.99
    ],
    [
     1940.23,
     1649.99
    ],
    [
     1968.23,
     1649.99
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propanal-reduction|in|propanal": {
   "reaction": "propanal-reduction",
   "dir": "in",
   "compound": "propanal",
   "tier": "secondary",
   "points": [
    [
     1701.85,
     1117.53
    ],
    [
     1701.85,
     1101.53
    ],
    [
     1620.53,
     988.15
    ],
    [
     1628.53,
     988.15
    ],
    [
     1656.53,
     988.15
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propanal-reduction|out|propan-1-ol": {
   "reaction": "propanal-reduction",
   "dir": "out",
   "compound": "propan-1-ol",
   "tier": "secondary",
   "points": [
    [
     1587.83,
     978.89
    ],
    [
     1603.83,
     978.89
    ],
    [
     1620.53,
     988.15
    ],
    [
     1628.53,
     988.15
    ],
    [
     1656.53,
     988.15
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "butanal-reduction|in|butanal": {
   "reaction": "butanal-reduction",
   "dir": "in",
   "compound": "butanal",
   "tier": "secondary",
   "points": [
    [
     3042.91,
     1395.36
    ],
    [
     3026.91,
     1395.36
    ],
    [
     2877.69,
     1446.01
    ],
    [
     2885.69,
     1446.01
    ],
    [
     2913.69,
     1446.01
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "butanal-reduction|out|butan-1-ol": {
   "reaction": "butanal-reduction",
   "dir": "out",
   "compound": "butan-1-ol",
   "tier": "secondary",
   "points": [
    [
     2913.69,
     1279.96
    ],
    [
     2913.69,
     1295.96
    ],
    [
     2877.69,
     1446.01
    ],
    [
     2885.69,
     1446.01
    ],
    [
     2913.69,
     1446.01
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-sodium|in|ethanol": {
   "reaction": "ethanol-sodium",
   "dir": "in",
   "compound": "ethanol",
   "tier": "primary",
   "points": [
    [
     1639.72,
     1352.23
    ],
    [
     1623.72,
     1352.23
    ],
    [
     1610,
     1290
    ],
    [
     1460,
     1250
    ],
    [
     1390.78,
     1133.42
    ],
    [
     1398.78,
     1133.42
    ],
    [
     1426.78,
     1133.42
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-sodium|out|sodium-ethoxide": {
   "reaction": "ethanol-sodium",
   "dir": "out",
   "compound": "sodium-ethoxide",
   "tier": "primary",
   "points": [
    [
     1546.76,
     858.18
    ],
    [
     1546.7600000000002,
     874.18
    ],
    [
     1590,
     940
    ],
    [
     1590,
     990
    ],
    [
     1390.78,
     1133.42
    ],
    [
     1398.78,
     1133.42
    ],
    [
     1426.78,
     1133.42
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "methanol-sodium|in|methanol": {
   "reaction": "methanol-sodium",
   "dir": "in",
   "compound": "methanol",
   "tier": "primary",
   "points": [
    [
     1548.6,
     1583.26
    ],
    [
     1548.6,
     1567.26
    ],
    [
     1520,
     1440
    ],
    [
     1520,
     1290
    ],
    [
     1550,
     1260
    ],
    [
     1570,
     1010
    ],
    [
     1590,
     990
    ],
    [
     1620.21,
     914.13
    ],
    [
     1628.21,
     914.13
    ],
    [
     1656.21,
     914.13
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "methanol-sodium|out|sodium-methoxide": {
   "reaction": "methanol-sodium",
   "dir": "out",
   "compound": "sodium-methoxide",
   "tier": "primary",
   "points": [
    [
     1790.58,
     762.76
    ],
    [
     1774.58,
     762.76
    ],
    [
     1620.21,
     914.13
    ],
    [
     1628.21,
     914.13
    ],
    [
     1656.21,
     914.13
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-ethanol-esterification|in|acetic-acid": {
   "reaction": "acetic-acid-ethanol-esterification",
   "dir": "in",
   "compound": "acetic-acid",
   "tier": "primary",
   "points": [
    [
     2136.86,
     1441.38
    ],
    [
     2136.86,
     1425.38
    ],
    [
     2110,
     1420
    ],
    [
     2027.83,
     1328.79
    ],
    [
     2035.83,
     1328.79
    ],
    [
     2063.83,
     1328.79
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-ethanol-esterification|in|ethanol": {
   "reaction": "acetic-acid-ethanol-esterification",
   "dir": "in",
   "compound": "ethanol",
   "tier": "primary",
   "points": [
    [
     1851.72,
     1364.23
    ],
    [
     1867.72,
     1364.23
    ],
    [
     1867.72,
     1328.79
    ],
    [
     2063.83,
     1328.79
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-ethanol-esterification|out|ethyl-acetate": {
   "reaction": "acetic-acid-ethanol-esterification",
   "dir": "out",
   "compound": "ethyl-acetate",
   "tier": "primary",
   "points": [
    [
     2197.83,
     1328.79
    ],
    [
     2181.83,
     1328.79
    ],
    [
     2072.16,
     1295.83
    ],
    [
     2063.83,
     1328.79
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-methanol-esterification|in|acetic-acid": {
   "reaction": "acetic-acid-methanol-esterification",
   "dir": "in",
   "compound": "acetic-acid",
   "tier": "secondary",
   "points": [
    [
     2119.9,
     1472.66
    ],
    [
     2103.9,
     1472.66
    ],
    [
     2050,
     1540
    ],
    [
     1910,
     1540
    ],
    [
     1890,
     1600
    ],
    [
     1699.26,
     1649.68
    ],
    [
     1707.26,
     1649.68
    ],
    [
     1735.26,
     1649.68
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-methanol-esterification|in|methanol": {
   "reaction": "acetic-acid-methanol-esterification",
   "dir": "in",
   "compound": "methanol",
   "tier": "secondary",
   "points": [
    [
     1564.12,
     1614.54
    ],
    [
     1580.12,
     1614.54
    ],
    [
     1699.26,
     1614.54
    ],
    [
     1699.26,
     1649.68
    ],
    [
     1707.26,
     1649.68
    ],
    [
     1735.26,
     1649.68
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-methanol-esterification|out|methyl-acetate": {
   "reaction": "acetic-acid-methanol-esterification",
   "dir": "out",
   "compound": "methyl-acetate",
   "tier": "secondary",
   "points": [
    [
     1735.26,
     1867.88
    ],
    [
     1735.26,
     1851.88
    ],
    [
     1780,
     1830
    ],
    [
     1770,
     1770
    ],
    [
     1730,
     1680
    ],
    [
     1699.26,
     1649.68
    ],
    [
     1707.26,
     1649.68
    ],
    [
     1735.26,
     1649.68
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-butanol-esterification|in|acetic-acid": {
   "reaction": "acetic-acid-butanol-esterification",
   "dir": "in",
   "compound": "acetic-acid",
   "tier": "secondary",
   "points": [
    [
     2331.9,
     1456.1
    ],
    [
     2347.9,
     1456.1000000000001
    ],
    [
     2370,
     1420
    ],
    [
     2460,
     1410
    ],
    [
     2510,
     1290
    ],
    [
     2630,
     1250
    ],
    [
     2635.52,
     1189.8
    ],
    [
     2643.52,
     1189.8
    ],
    [
     2671.52,
     1189.8
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-butanol-esterification|in|butan-1-ol": {
   "reaction": "acetic-acid-butanol-esterification",
   "dir": "in",
   "compound": "butan-1-ol",
   "tier": "secondary",
   "points": [
    [
     2866.47,
     1248.68
    ],
    [
     2850.47,
     1248.68
    ],
    [
     2635.52,
     1189.8
    ],
    [
     2643.52,
     1189.8
    ],
    [
     2671.52,
     1189.8
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-butanol-esterification|out|butyl-acetate": {
   "reaction": "acetic-acid-butanol-esterification",
   "dir": "out",
   "compound": "butyl-acetate",
   "tier": "secondary",
   "points": [
    [
     2742.46,
     1308.06
    ],
    [
     2742.46,
     1292.06
    ],
    [
     2635.52,
     1189.8
    ],
    [
     2643.52,
     1189.8
    ],
    [
     2671.52,
     1189.8
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-isoamyl-esterification|in|acetic-acid": {
   "reaction": "acetic-acid-isoamyl-esterification",
   "dir": "in",
   "compound": "acetic-acid",
   "tier": "secondary",
   "points": [
    [
     2119.9,
     1472.66
    ],
    [
     2103.9,
     1472.66
    ],
    [
     2032.17,
     1576.06
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-isoamyl-esterification|in|3-methylbutan-1-ol": {
   "reaction": "acetic-acid-isoamyl-esterification",
   "dir": "in",
   "compound": "3-methylbutan-1-ol",
   "tier": "secondary",
   "points": [
    [
     2610.55,
     1404.52
    ],
    [
     2594.55,
     1404.52
    ],
    [
     2350,
     1430
    ],
    [
     2340,
     1480
    ],
    [
     2150,
     1510
    ],
    [
     1996.17,
     1576.06
    ],
    [
     2004.17,
     1576.06
    ],
    [
     2032.17,
     1576.06
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-isoamyl-esterification|out|isoamyl-acetate": {
   "reaction": "acetic-acid-isoamyl-esterification",
   "dir": "out",
   "compound": "isoamyl-acetate",
   "tier": "secondary",
   "points": [
    [
     1237.09,
     2054.47
    ],
    [
     1253.09,
     2054.47
    ],
    [
     1460,
     1960
    ],
    [
     1500,
     1960
    ],
    [
     1670,
     1890
    ],
    [
     1740,
     1830
    ],
    [
     1780,
     1830
    ],
    [
     1800,
     1760
    ],
    [
     1890,
     1760
    ],
    [
     1910,
     1690
    ],
    [
     1960,
     1610
    ],
    [
     2000,
     1610
    ],
    [
     1996.17,
     1576.06
    ],
    [
     2004.17,
     1576.06
    ],
    [
     2032.17,
     1576.06
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-glycerol-esterification|in|glycerol": {
   "reaction": "acetic-acid-glycerol-esterification",
   "dir": "in",
   "compound": "glycerol",
   "tier": "secondary",
   "points": [
    [
     1778.32,
     1929.98
    ],
    [
     1778.32,
     1913.98
    ],
    [
     1850,
     1910
    ],
    [
     1840,
     1850
    ],
    [
     1750,
     1740
    ],
    [
     1742.32,
     1723.72
    ],
    [
     1750.32,
     1723.72
    ],
    [
     1778.32,
     1723.72
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-glycerol-esterification|out|triacetin": {
   "reaction": "acetic-acid-glycerol-esterification",
   "dir": "out",
   "compound": "triacetin",
   "tier": "secondary",
   "points": [
    [
     1666.38,
     1856.11
    ],
    [
     1682.38,
     1856.11
    ],
    [
     1778.32,
     1856.11
    ],
    [
     1778.32,
     1723.72
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "formic-acid-methanol-esterification|in|formic-acid": {
   "reaction": "formic-acid-methanol-esterification",
   "dir": "in",
   "compound": "formic-acid",
   "tier": "secondary",
   "points": [
    [
     1128.17,
     1561.55
    ],
    [
     1144.17,
     1561.55
    ],
    [
     1140.18,
     1556.56
    ],
    [
     1148.18,
     1556.56
    ],
    [
     1176.18,
     1556.56
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "formic-acid-methanol-esterification|in|methanol": {
   "reaction": "formic-acid-methanol-esterification",
   "dir": "in",
   "compound": "methanol",
   "tier": "secondary",
   "points": [
    [
     1370.12,
     1585.98
    ],
    [
     1354.12,
     1585.98
    ],
    [
     1140.18,
     1585.98
    ],
    [
     1140.18,
     1556.56
    ],
    [
     1148.18,
     1556.56
    ],
    [
     1176.18,
     1556.56
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "formic-acid-methanol-esterification|out|methyl-formate": {
   "reaction": "formic-acid-methanol-esterification",
   "dir": "out",
   "compound": "methyl-formate",
   "tier": "secondary",
   "points": [
    [
     1310.28,
     1552.53
    ],
    [
     1294.28,
     1552.53
    ],
    [
     1177.56,
     1532.6
    ],
    [
     1176.18,
     1556.56
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "formic-acid-ethanol-esterification|in|formic-acid": {
   "reaction": "formic-acid-ethanol-esterification",
   "dir": "in",
   "compound": "formic-acid",
   "tier": "secondary",
   "points": [
    [
     1061.07,
     1558.83
    ],
    [
     1061.07,
     1542.83
    ],
    [
     1025.07,
     1369.71
    ],
    [
     1033.07,
     1369.71
    ],
    [
     1061.07,
     1369.71
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "formic-acid-ethanol-esterification|in|ethanol": {
   "reaction": "formic-acid-ethanol-esterification",
   "dir": "in",
   "compound": "ethanol",
   "tier": "secondary",
   "points": [
    [
     1639.72,
     1369.71
    ],
    [
     1623.72,
     1369.71
    ],
    [
     1070.58,
     1347.68
    ],
    [
     1061.07,
     1369.71
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "formic-acid-ethanol-esterification|out|ethyl-formate": {
   "reaction": "formic-acid-ethanol-esterification",
   "dir": "out",
   "compound": "ethyl-formate",
   "tier": "secondary",
   "points": [
    [
     984.28,
     1435.54
    ],
    [
     1000.28,
     1435.54
    ],
    [
     1025.07,
     1369.71
    ],
    [
     1033.07,
     1369.71
    ],
    [
     1061.07,
     1369.71
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propionic-acid-methanol-esterification|in|propionic-acid": {
   "reaction": "propionic-acid-methanol-esterification",
   "dir": "in",
   "compound": "propionic-acid",
   "tier": "secondary",
   "points": [
    [
     1612.14,
     1445.55
    ],
    [
     1612.14,
     1461.55
    ],
    [
     1576.14,
     1575.63
    ],
    [
     1584.14,
     1575.63
    ],
    [
     1612.14,
     1575.63
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propionic-acid-methanol-esterification|in|methanol": {
   "reaction": "propionic-acid-methanol-esterification",
   "dir": "in",
   "compound": "methanol",
   "tier": "secondary",
   "points": [
    [
     1564.12,
     1585.98
    ],
    [
     1580.12,
     1585.98
    ],
    [
     1576.14,
     1575.63
    ],
    [
     1584.14,
     1575.63
    ],
    [
     1612.14,
     1575.63
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propionic-acid-methanol-esterification|out|methyl-propionate": {
   "reaction": "propionic-acid-methanol-esterification",
   "dir": "out",
   "compound": "methyl-propionate",
   "tier": "secondary",
   "points": [
    [
     1746.16,
     1575.63
    ],
    [
     1730.16,
     1575.63
    ],
    [
     1621.23,
     1608.39
    ],
    [
     1612.14,
     1575.63
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propionic-acid-ethanol-esterification|in|propionic-acid": {
   "reaction": "propionic-acid-ethanol-esterification",
   "dir": "in",
   "compound": "propionic-acid",
   "tier": "secondary",
   "points": [
    [
     1523.71,
     1414.27
    ],
    [
     1507.71,
     1414.27
    ],
    [
     1460,
     1360
    ],
    [
     1265.69,
     1317.24
    ],
    [
     1273.69,
     1317.24
    ],
    [
     1301.69,
     1317.24
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propionic-acid-ethanol-esterification|in|ethanol": {
   "reaction": "propionic-acid-ethanol-esterification",
   "dir": "in",
   "compound": "ethanol",
   "tier": "secondary",
   "points": [
    [
     1639.72,
     1372.23
    ],
    [
     1623.72,
     1372.23
    ],
    [
     1312.36,
     1338.74
    ],
    [
     1301.69,
     1317.24
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propionic-acid-ethanol-esterification|out|ethyl-propionate": {
   "reaction": "propionic-acid-ethanol-esterification",
   "dir": "out",
   "compound": "ethyl-propionate",
   "tier": "secondary",
   "points": [
    [
     1301.69,
     1385.93
    ],
    [
     1301.69,
     1369.93
    ],
    [
     1265.69,
     1317.24
    ],
    [
     1273.69,
     1317.24
    ],
    [
     1301.69,
     1317.24
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "butanoic-acid-ethanol-esterification|in|butanoic-acid": {
   "reaction": "butanoic-acid-ethanol-esterification",
   "dir": "in",
   "compound": "butanoic-acid",
   "tier": "secondary",
   "points": [
    [
     3164.25,
     1576.02
    ],
    [
     3148.25,
     1576.02
    ],
    [
     2968.01,
     1561.57
    ],
    [
     2982.58,
     1580.64
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "butanoic-acid-ethanol-esterification|in|ethanol": {
   "reaction": "butanoic-acid-ethanol-esterification",
   "dir": "in",
   "compound": "ethanol",
   "tier": "secondary",
   "points": [
    [
     1851.72,
     1375.51
    ],
    [
     1867.72,
     1375.51
    ],
    [
     2320,
     1380
    ],
    [
     2380,
     1420
    ],
    [
     2600,
     1420
    ],
    [
     2690,
     1430
    ],
    [
     2720,
     1490
    ],
    [
     2860,
     1500
    ],
    [
     2946.58,
     1580.64
    ],
    [
     2954.58,
     1580.64
    ],
    [
     2982.58,
     1580.64
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "butanoic-acid-ethanol-esterification|out|ethyl-butyrate": {
   "reaction": "butanoic-acid-ethanol-esterification",
   "dir": "out",
   "compound": "ethyl-butyrate",
   "tier": "secondary",
   "points": [
    [
     3133.22,
     1756.57
    ],
    [
     3117.22,
     1756.57
    ],
    [
     2946.58,
     1580.64
    ],
    [
     2954.58,
     1580.64
    ],
    [
     2982.58,
     1580.64
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "oxalic-acid-methanol-esterification|in|oxalic-acid": {
   "reaction": "oxalic-acid-methanol-esterification",
   "dir": "in",
   "compound": "oxalic-acid",
   "tier": "secondary",
   "points": [
    [
     1670.78,
     1645.36
    ],
    [
     1670.7800000000002,
     1629.36
    ],
    [
     1720,
     1610
    ],
    [
     1720,
     1540
    ],
    [
     1699.91,
     1501.59
    ],
    [
     1707.91,
     1501.59
    ],
    [
     1735.91,
     1501.59
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "oxalic-acid-methanol-esterification|in|methanol": {
   "reaction": "oxalic-acid-methanol-esterification",
   "dir": "in",
   "compound": "methanol",
   "tier": "secondary",
   "points": [
    [
     1564.12,
     1597.98
    ],
    [
     1580.12,
     1597.98
    ],
    [
     1580.12,
     1501.59
    ],
    [
     1735.91,
     1501.59
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "oxalic-acid-methanol-esterification|out|dimethyl-oxalate": {
   "reaction": "oxalic-acid-methanol-esterification",
   "dir": "out",
   "compound": "dimethyl-oxalate",
   "tier": "secondary",
   "points": [
    [
     2506.26,
     1342.49
    ],
    [
     2490.26,
     1342.49
    ],
    [
     2360,
     1350
    ],
    [
     2300,
     1420
    ],
    [
     2100,
     1440
    ],
    [
     2090,
     1460
    ],
    [
     1740,
     1480
    ],
    [
     1699.91,
     1501.59
    ],
    [
     1707.91,
     1501.59
    ],
    [
     1735.91,
     1501.59
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-anhydride|in|acetic-acid": {
   "reaction": "acetic-acid-anhydride",
   "dir": "in",
   "compound": "acetic-acid",
   "tier": "primary",
   "points": [
    [
     2331.9,
     1444.1
    ],
    [
     2347.9,
     1444.1
    ],
    [
     2345.84,
     1382.96
    ],
    [
     2353.84,
     1382.96
    ],
    [
     2381.84,
     1382.96
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-anhydride|out|acetic-anhydride": {
   "reaction": "acetic-acid-anhydride",
   "dir": "out",
   "compound": "acetic-anhydride",
   "tier": "primary",
   "points": [
    [
     2544.34,
     1522.03
    ],
    [
     2528.34,
     1522.03
    ],
    [
     2510,
     1490
    ],
    [
     2470,
     1480
    ],
    [
     2440,
     1420
    ],
    [
     2345.84,
     1382.96
    ],
    [
     2353.84,
     1382.96
    ],
    [
     2381.84,
     1382.96
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "salicylic-acid-methyl-esterification|in|salicylic-acid": {
   "reaction": "salicylic-acid-methyl-esterification",
   "dir": "in",
   "compound": "salicylic-acid",
   "tier": "primary",
   "points": [
    [
     2512.86,
     1668.07
    ],
    [
     2496.86,
     1668.07
    ],
    [
     2190.54,
     1607.54
    ],
    [
     2213.84,
     1601.8
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "salicylic-acid-methyl-esterification|in|methanol": {
   "reaction": "salicylic-acid-methyl-esterification",
   "dir": "in",
   "compound": "methanol",
   "tier": "primary",
   "points": [
    [
     1564.12,
     1601.8
    ],
    [
     1580.12,
     1601.8
    ],
    [
     1660,
     1610
    ],
    [
     2170,
     1610
    ],
    [
     2177.84,
     1601.8
    ],
    [
     2185.84,
     1601.8
    ],
    [
     2213.84,
     1601.8
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "salicylic-acid-methyl-esterification|out|methyl-salicylate": {
   "reaction": "salicylic-acid-methyl-esterification",
   "dir": "out",
   "compound": "methyl-salicylate",
   "tier": "primary",
   "points": [
    [
     2418.15,
     1742.1
    ],
    [
     2402.15,
     1742.1000000000001
    ],
    [
     2260,
     1700
    ],
    [
     2177.84,
     1601.8
    ],
    [
     2185.84,
     1601.8
    ],
    [
     2213.84,
     1601.8
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "salicylic-acid-acetylation|in|salicylic-acid": {
   "reaction": "salicylic-acid-acetylation",
   "dir": "in",
   "compound": "salicylic-acid",
   "tier": "primary",
   "points": [
    [
     2688.86,
     1680.07
    ],
    [
     2704.86,
     1680.07
    ],
    [
     2680,
     1630
    ],
    [
     2680,
     1580
    ],
    [
     2717.77,
     1535.28
    ],
    [
     2725.77,
     1535.28
    ],
    [
     2753.77,
     1535.28
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "salicylic-acid-acetylation|in|acetic-anhydride": {
   "reaction": "salicylic-acid-acetylation",
   "dir": "in",
   "compound": "acetic-anhydride",
   "tier": "primary",
   "points": [
    [
     2680.34,
     1535.28
    ],
    [
     2696.34,
     1535.28
    ],
    [
     2717.77,
     1535.28
    ],
    [
     2725.77,
     1535.28
    ],
    [
     2753.77,
     1535.28
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "salicylic-acid-acetylation|out|aspirin": {
   "reaction": "salicylic-acid-acetylation",
   "dir": "out",
   "compound": "aspirin",
   "tier": "primary",
   "points": [
    [
     2839.38,
     1686.05
    ],
    [
     2839.38,
     1670.05
    ],
    [
     2790,
     1570
    ],
    [
     2717.77,
     1535.28
    ],
    [
     2725.77,
     1535.28
    ],
    [
     2753.77,
     1535.28
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "aspirin-hydrolysis|in|aspirin": {
   "reaction": "aspirin-hydrolysis",
   "dir": "in",
   "compound": "aspirin",
   "tier": "primary",
   "points": [
    [
     2828.5,
     1688.77
    ],
    [
     2812.5,
     1688.77
    ],
    [
     2662.36,
     1609.32
    ],
    [
     2670.36,
     1609.32
    ],
    [
     2698.36,
     1609.32
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "aspirin-hydrolysis|out|salicylic-acid": {
   "reaction": "aspirin-hydrolysis",
   "dir": "out",
   "compound": "salicylic-acid",
   "tier": "primary",
   "points": [
    [
     2674.78,
     1665.35
    ],
    [
     2674.78,
     1649.35
    ],
    [
     2662.36,
     1609.32
    ],
    [
     2670.36,
     1609.32
    ],
    [
     2698.36,
     1609.32
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "aspirin-hydrolysis|out|acetic-acid": {
   "reaction": "aspirin-hydrolysis",
   "dir": "out",
   "compound": "acetic-acid",
   "tier": "primary",
   "points": [
    [
     2331.9,
     1472.66
    ],
    [
     2347.9,
     1472.66
    ],
    [
     2370,
     1490
    ],
    [
     2530,
     1500
    ],
    [
     2540,
     1560
    ],
    [
     2680,
     1580
    ],
    [
     2698.36,
     1609.32
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "methyl-salicylate-hydrolysis|in|methyl-salicylate": {
   "reaction": "methyl-salicylate-hydrolysis",
   "dir": "in",
   "compound": "methyl-salicylate",
   "tier": "primary",
   "points": [
    [
     2418.15,
     1730.1
    ],
    [
     2402.15,
     1730.1
    ],
    [
     2255.44,
     1675.9
    ],
    [
     2263.44,
     1675.9
    ],
    [
     2291.44,
     1675.9
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "methyl-salicylate-hydrolysis|out|salicylic-acid": {
   "reaction": "methyl-salicylate-hydrolysis",
   "dir": "out",
   "compound": "salicylic-acid",
   "tier": "primary",
   "points": [
    [
     2512.86,
     1675.9
    ],
    [
     2496.86,
     1675.9
    ],
    [
     2295.92,
     1652.32
    ],
    [
     2291.44,
     1675.9
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "methyl-salicylate-hydrolysis|out|methanol": {
   "reaction": "methyl-salicylate-hydrolysis",
   "dir": "out",
   "compound": "methanol",
   "tier": "primary",
   "points": [
    [
     1564.12,
     1609.26
    ],
    [
     1580.12,
     1609.26
    ],
    [
     2140,
     1620
    ],
    [
     2255.44,
     1675.9
    ],
    [
     2263.44,
     1675.9
    ],
    [
     2291.44,
     1675.9
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyl-acetate-hydrolysis|in|ethyl-acetate": {
   "reaction": "ethyl-acetate-hydrolysis",
   "dir": "in",
   "compound": "ethyl-acetate",
   "tier": "primary",
   "points": [
    [
     2197.83,
     1321.99
    ],
    [
     2181.83,
     1321.99
    ],
    [
     2170,
     1300
    ],
    [
     2064.27,
     1254.69
    ],
    [
     2072.27,
     1254.69
    ],
    [
     2100.27,
     1254.69
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyl-acetate-hydrolysis|out|acetic-acid": {
   "reaction": "ethyl-acetate-hydrolysis",
   "dir": "out",
   "compound": "acetic-acid",
   "tier": "primary",
   "points": [
    [
     2148.86,
     1441.38
    ],
    [
     2148.86,
     1425.38
    ],
    [
     2110,
     1420
    ],
    [
     2060,
     1360
    ],
    [
     2050,
     1360
    ],
    [
     2050,
     1260
    ],
    [
     2064.27,
     1254.69
    ],
    [
     2072.27,
     1254.69
    ],
    [
     2100.27,
     1254.69
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyl-acetate-hydrolysis|out|ethanol": {
   "reaction": "ethyl-acetate-hydrolysis",
   "dir": "out",
   "compound": "ethanol",
   "tier": "primary",
   "points": [
    [
     1851.72,
     1357.51
    ],
    [
     1867.72,
     1357.51
    ],
    [
     1880,
     1330
    ],
    [
     2010,
     1310
    ],
    [
     2064.27,
     1254.69
    ],
    [
     2072.27,
     1254.69
    ],
    [
     2100.27,
     1254.69
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-neutralization|in|acetic-acid": {
   "reaction": "acetic-acid-neutralization",
   "dir": "in",
   "compound": "acetic-acid",
   "tier": "primary",
   "points": [
    [
     2331.9,
     1456.76
    ],
    [
     2347.9,
     1456.76
    ],
    [
     2343.94,
     1456.76
    ],
    [
     2351.94,
     1456.76
    ],
    [
     2379.94,
     1456.76
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-neutralization|out|sodium-acetate": {
   "reaction": "acetic-acid-neutralization",
   "dir": "out",
   "compound": "sodium-acetate",
   "tier": "primary",
   "points": [
    [
     2302.18,
     1514.51
    ],
    [
     2318.18,
     1514.51
    ],
    [
     2343.94,
     1456.76
    ],
    [
     2351.94,
     1456.76
    ],
    [
     2379.94,
     1456.76
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-sodium-carbonate|in|acetic-acid": {
   "reaction": "acetic-acid-sodium-carbonate",
   "dir": "in",
   "compound": "acetic-acid",
   "tier": "primary",
   "points": [
    [
     2314.94,
     1475.38
    ],
    [
     2314.94,
     1491.38
    ],
    [
     2314.2,
     1529.44
    ],
    [
     2322.2,
     1529.44
    ],
    [
     2350.2,
     1529.44
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-sodium-carbonate|out|sodium-acetate": {
   "reaction": "acetic-acid-sodium-carbonate",
   "dir": "out",
   "compound": "sodium-acetate",
   "tier": "primary",
   "points": [
    [
     2302.18,
     1529.44
    ],
    [
     2318.18,
     1529.44
    ],
    [
     2314.2,
     1529.44
    ],
    [
     2322.2,
     1529.44
    ],
    [
     2350.2,
     1529.44
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sodium-acetate-decarboxylation|in|sodium-acetate": {
   "reaction": "sodium-acetate-decarboxylation",
   "dir": "in",
   "compound": "sodium-acetate",
   "tier": "primary",
   "points": [
    [
     2166.18,
     1514.51
    ],
    [
     2150.18,
     1514.51
    ],
    [
     2100,
     1460
    ],
    [
     2100,
     1400
    ],
    [
     2010,
     1330
    ],
    [
     1800,
     1310
    ],
    [
     1660,
     1220
    ],
    [
     1630,
     1170
    ],
    [
     1562.97,
     1136.25
    ],
    [
     1570.97,
     1136.25
    ],
    [
     1598.97,
     1136.25
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sodium-acetate-decarboxylation|out|methane": {
   "reaction": "sodium-acetate-decarboxylation",
   "dir": "out",
   "compound": "methane",
   "tier": "primary",
   "points": [
    [
     1482.84,
     1040.99
    ],
    [
     1498.84,
     1040.99
    ],
    [
     1562.97,
     1040.99
    ],
    [
     1562.97,
     1136.25
    ],
    [
     1570.97,
     1136.25
    ],
    [
     1598.97,
     1136.25
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzoic-acid-neutralization|in|benzoic-acid": {
   "reaction": "benzoic-acid-neutralization",
   "dir": "in",
   "compound": "benzoic-acid",
   "tier": "primary",
   "points": [
    [
     3115.68,
     2345.57
    ],
    [
     3131.68,
     2345.57
    ],
    [
     3151.95,
     2345.57
    ],
    [
     3159.95,
     2345.57
    ],
    [
     3187.95,
     2345.57
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzoic-acid-neutralization|out|sodium-benzoate": {
   "reaction": "benzoic-acid-neutralization",
   "dir": "out",
   "compound": "sodium-benzoate",
   "tier": "primary",
   "points": [
    [
     3196.8,
     2180.79
    ],
    [
     3196.8,
     2196.79
    ],
    [
     3151.95,
     2345.57
    ],
    [
     3159.95,
     2345.57
    ],
    [
     3187.95,
     2345.57
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycerol-stearic-esterification|in|glycerol": {
   "reaction": "glycerol-stearic-esterification",
   "dir": "in",
   "compound": "glycerol",
   "tier": "primary",
   "points": [
    [
     1583.43,
     1955.98
    ],
    [
     1567.43,
     1955.98
    ],
    [
     1413.33,
     1999.58
    ],
    [
     1421.33,
     1999.58
    ],
    [
     1449.33,
     1999.58
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycerol-stearic-esterification|in|stearic-acid": {
   "reaction": "glycerol-stearic-esterification",
   "dir": "in",
   "compound": "stearic-acid",
   "tier": "primary",
   "points": [
    [
     1358.91,
     2127.36
    ],
    [
     1374.91,
     2127.36
    ],
    [
     1470,
     2100
    ],
    [
     1470,
     2040
    ],
    [
     1449.33,
     1999.58
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycerol-stearic-esterification|out|tristearin": {
   "reaction": "glycerol-stearic-esterification",
   "dir": "out",
   "compound": "tristearin",
   "tier": "primary",
   "points": [
    [
     1630.19,
     2139.93
    ],
    [
     1614.19,
     2139.93
    ],
    [
     1480,
     2100
    ],
    [
     1460,
     2040
    ],
    [
     1413.33,
     1999.58
    ],
    [
     1421.33,
     1999.58
    ],
    [
     1449.33,
     1999.58
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycerol-palmitic-esterification|in|glycerol": {
   "reaction": "glycerol-palmitic-esterification",
   "dir": "in",
   "compound": "glycerol",
   "tier": "secondary",
   "points": [
    [
     1795.43,
     1932.7
    ],
    [
     1811.43,
     1932.7
    ],
    [
     1850,
     1900
    ],
    [
     1880,
     1830
    ],
    [
     1910,
     1830
    ],
    [
     1910,
     1760
    ],
    [
     1886.42,
     1723.47
    ],
    [
     1894.42,
     1723.47
    ],
    [
     1922.42,
     1723.47
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycerol-palmitic-esterification|in|palmitic-acid": {
   "reaction": "glycerol-palmitic-esterification",
   "dir": "in",
   "compound": "palmitic-acid",
   "tier": "secondary",
   "points": [
    [
     2067.31,
     1723.47
    ],
    [
     2051.31,
     1723.47
    ],
    [
     1939.92,
     1752.62
    ],
    [
     1922.42,
     1723.47
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycerol-palmitic-esterification|out|tripalmitin": {
   "reaction": "glycerol-palmitic-esterification",
   "dir": "out",
   "compound": "tripalmitin",
   "tier": "secondary",
   "points": [
    [
     1768.73,
     1794.09
    ],
    [
     1784.73,
     1794.09
    ],
    [
     1810,
     1760
    ],
    [
     1890,
     1760
    ],
    [
     1886.42,
     1723.47
    ],
    [
     1894.42,
     1723.47
    ],
    [
     1922.42,
     1723.47
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycerol-oleic-esterification|in|glycerol": {
   "reaction": "glycerol-oleic-esterification",
   "dir": "in",
   "compound": "glycerol",
   "tier": "secondary",
   "points": [
    [
     1795.43,
     1944.7
    ],
    [
     1811.43,
     1944.7
    ],
    [
     2000.6,
     1892.91
    ],
    [
     1989.93,
     1871.41
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycerol-oleic-esterification|in|oleic-acid": {
   "reaction": "glycerol-oleic-esterification",
   "dir": "in",
   "compound": "oleic-acid",
   "tier": "secondary",
   "points": [
    [
     2639.93,
     1787.33
    ],
    [
     2623.93,
     1787.33
    ],
    [
     2250,
     1780
    ],
    [
     2190,
     1820
    ],
    [
     1990,
     1850
    ],
    [
     1989.93,
     1871.41
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycerol-oleic-esterification|out|triolein": {
   "reaction": "glycerol-oleic-esterification",
   "dir": "out",
   "compound": "triolein",
   "tier": "secondary",
   "points": [
    [
     2080.01,
     2089.16
    ],
    [
     2080.01,
     2073.16
    ],
    [
     2040,
     2030
    ],
    [
     2030,
     1900
    ],
    [
     1990,
     1880
    ],
    [
     1989.93,
     1871.41
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycerol-linoleic-esterification|in|glycerol": {
   "reaction": "glycerol-linoleic-esterification",
   "dir": "in",
   "compound": "glycerol",
   "tier": "secondary",
   "points": [
    [
     1583.43,
     1937.98
    ],
    [
     1567.43,
     1937.98
    ],
    [
     1490,
     1890
    ],
    [
     1341.68,
     1851.45
    ],
    [
     1349.68,
     1851.45
    ],
    [
     1377.68,
     1851.45
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycerol-linoleic-esterification|in|linoleic-acid": {
   "reaction": "glycerol-linoleic-esterification",
   "dir": "in",
   "compound": "linoleic-acid",
   "tier": "secondary",
   "points": [
    [
     1248.64,
     1831.79
    ],
    [
     1264.64,
     1831.79
    ],
    [
     1341.68,
     1851.45
    ],
    [
     1349.68,
     1851.45
    ],
    [
     1377.68,
     1851.45
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycerol-linoleic-esterification|out|trilinolein": {
   "reaction": "glycerol-linoleic-esterification",
   "dir": "out",
   "compound": "trilinolein",
   "tier": "secondary",
   "points": [
    [
     1377.68,
     2057.26
    ],
    [
     1377.68,
     2041.26
    ],
    [
     1341.68,
     1851.45
    ],
    [
     1349.68,
     1851.45
    ],
    [
     1377.68,
     1851.45
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "tristearin-saponification|in|tristearin": {
   "reaction": "tristearin-saponification",
   "dir": "in",
   "compound": "tristearin",
   "tier": "primary",
   "points": [
    [
     1630.19,
     2156.49
    ],
    [
     1614.19,
     2156.49
    ],
    [
     1473.04,
     2191.68
    ],
    [
     1481.04,
     2191.68
    ],
    [
     1509.04,
     2191.68
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "tristearin-saponification|out|sodium-stearate": {
   "reaction": "tristearin-saponification",
   "dir": "out",
   "compound": "sodium-stearate",
   "tier": "primary",
   "points": [
    [
     1467.41,
     2378.17
    ],
    [
     1467.41,
     2362.17
    ],
    [
     1530,
     2360
    ],
    [
     1520,
     2220
    ],
    [
     1509.04,
     2191.68
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "tristearin-saponification|out|glycerol": {
   "reaction": "tristearin-saponification",
   "dir": "out",
   "compound": "glycerol",
   "tier": "primary",
   "points": [
    [
     1600.39,
     1963.98
    ],
    [
     1600.39,
     1979.98
    ],
    [
     1610,
     2110
    ],
    [
     1510,
     2180
    ],
    [
     1509.04,
     2191.68
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "tripalmitin-saponification|in|tripalmitin": {
   "reaction": "tripalmitin-saponification",
   "dir": "in",
   "compound": "tripalmitin",
   "tier": "secondary",
   "points": [
    [
     1632.73,
     1794.09
    ],
    [
     1616.73,
     1794.09
    ],
    [
     1438.38,
     1794.09
    ],
    [
     1438.38,
     1777.44
    ],
    [
     1446.38,
     1777.44
    ],
    [
     1474.38,
     1777.44
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "tripalmitin-saponification|out|sodium-palmitate": {
   "reaction": "tripalmitin-saponification",
   "dir": "out",
   "compound": "sodium-palmitate",
   "tier": "secondary",
   "points": [
    [
     1102.17,
     1774.97
    ],
    [
     1118.17,
     1774.97
    ],
    [
     1459.94,
     1821.12
    ],
    [
     1474.38,
     1777.44
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "tripalmitin-saponification|out|glycerol": {
   "reaction": "tripalmitin-saponification",
   "dir": "out",
   "compound": "glycerol",
   "tier": "secondary",
   "points": [
    [
     1583.43,
     1932.7
    ],
    [
     1567.43,
     1932.7
    ],
    [
     1490,
     1850
    ],
    [
     1490,
     1820
    ],
    [
     1438.38,
     1777.44
    ],
    [
     1446.38,
     1777.44
    ],
    [
     1474.38,
     1777.44
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "triolein-saponification|in|triolein": {
   "reaction": "triolein-saponification",
   "dir": "in",
   "compound": "triolein",
   "tier": "secondary",
   "points": [
    [
     2194.25,
     2089.16
    ],
    [
     2194.25,
     2073.16
    ],
    [
     2150,
     2070
    ],
    [
     2150,
     2000
    ],
    [
     2200,
     1970
    ],
    [
     2201.05,
     1889.32
    ],
    [
     2209.05,
     1889.32
    ],
    [
     2237.05,
     1889.32
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "triolein-saponification|out|sodium-oleate": {
   "reaction": "triolein-saponification",
   "dir": "out",
   "compound": "sodium-oleate",
   "tier": "secondary",
   "points": [
    [
     2960.27,
     1930.42
    ],
    [
     2944.27,
     1930.42
    ],
    [
     2930,
     1950
    ],
    [
     2770,
     1950
    ],
    [
     2720,
     1910
    ],
    [
     2240,
     1910
    ],
    [
     2201.05,
     1889.32
    ],
    [
     2209.05,
     1889.32
    ],
    [
     2237.05,
     1889.32
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "triolein-saponification|out|glycerol": {
   "reaction": "triolein-saponification",
   "dir": "out",
   "compound": "glycerol",
   "tier": "secondary",
   "points": [
    [
     1795.43,
     1944.7
    ],
    [
     1811.43,
     1944.7
    ],
    [
     1980,
     1910
    ],
    [
     2190,
     1900
    ],
    [
     2201.05,
     1889.32
    ],
    [
     2209.05,
     1889.32
    ],
    [
     2237.05,
     1889.32
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "tristearin-hydrolysis|in|tristearin": {
   "reaction": "tristearin-hydrolysis",
   "dir": "in",
   "compound": "tristearin",
   "tier": "primary",
   "points": [
    [
     1630.19,
     2127.93
    ],
    [
     1614.19,
     2127.93
    ],
    [
     1474.09,
     2073.61
    ],
    [
     1482.09,
     2073.61
    ],
    [
     1510.09,
     2073.61
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "tristearin-hydrolysis|out|stearic-acid": {
   "reaction": "tristearin-hydrolysis",
   "dir": "out",
   "compound": "stearic-acid",
   "tier": "primary",
   "points": [
    [
     1358.91,
     2134.08
    ],
    [
     1374.91,
     2134.08
    ],
    [
     1474.09,
     2134.08
    ],
    [
     1474.09,
     2073.61
    ],
    [
     1482.09,
     2073.61
    ],
    [
     1510.09,
     2073.61
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "tristearin-hydrolysis|out|glycerol": {
   "reaction": "tristearin-hydrolysis",
   "dir": "out",
   "compound": "glycerol",
   "tier": "primary",
   "points": [
    [
     1583.43,
     1961.26
    ],
    [
     1567.43,
     1961.26
    ],
    [
     1560,
     2030
    ],
    [
     1474.09,
     2073.61
    ],
    [
     1482.09,
     2073.61
    ],
    [
     1510.09,
     2073.61
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "triolein-hydrogenation|in|triolein": {
   "reaction": "triolein-hydrogenation",
   "dir": "in",
   "compound": "triolein",
   "tier": "primary",
   "points": [
    [
     2069.13,
     2120.44
    ],
    [
     2053.13,
     2120.44
    ],
    [
     2000,
     2200
    ],
    [
     1870,
     2270
    ],
    [
     1804.67,
     2298.38
    ],
    [
     1812.67,
     2298.38
    ],
    [
     1840.67,
     2298.38
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "triolein-hydrogenation|out|tristearin": {
   "reaction": "triolein-hydrogenation",
   "dir": "out",
   "compound": "tristearin",
   "tier": "primary",
   "points": [
    [
     1792.11,
     2159.21
    ],
    [
     1792.1100000000001,
     2175.21
    ],
    [
     1770,
     2220
    ],
    [
     1790,
     2290
    ],
    [
     1804.67,
     2298.38
    ],
    [
     1812.67,
     2298.38
    ],
    [
     1840.67,
     2298.38
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "maleic-acid-anhydride|in|maleic-acid": {
   "reaction": "maleic-acid-anhydride",
   "dir": "in",
   "compound": "maleic-acid",
   "tier": "primary",
   "points": [
    [
     1973.09,
     3378.49
    ],
    [
     1973.09,
     3362.49
    ],
    [
     1972.56,
     3293.19
    ],
    [
     1980.56,
     3293.19
    ],
    [
     2008.56,
     3293.19
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "maleic-acid-anhydride|out|maleic-anhydride": {
   "reaction": "maleic-acid-anhydride",
   "dir": "out",
   "compound": "maleic-anhydride",
   "tier": "primary",
   "points": [
    [
     2039.9,
     3481.13
    ],
    [
     2039.9,
     3465.13
    ],
    [
     1972.56,
     3293.19
    ],
    [
     1980.56,
     3293.19
    ],
    [
     2008.56,
     3293.19
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phthalic-acid-anhydride|in|phthalic-acid": {
   "reaction": "phthalic-acid-anhydride",
   "dir": "in",
   "compound": "phthalic-acid",
   "tier": "primary",
   "points": [
    [
     2347.94,
     1618.04
    ],
    [
     2331.94,
     1618.04
    ],
    [
     2310,
     1640
    ],
    [
     2270,
     1650
    ],
    [
     2215.41,
     1745.77
    ],
    [
     2223.41,
     1745.77
    ],
    [
     2251.41,
     1745.77
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phthalic-acid-anhydride|out|phthalic-anhydride": {
   "reaction": "phthalic-acid-anhydride",
   "dir": "out",
   "compound": "phthalic-anhydride",
   "tier": "primary",
   "points": [
    [
     2202.85,
     1774.33
    ],
    [
     2218.85,
     1774.33
    ],
    [
     2215.41,
     1745.77
    ],
    [
     2223.41,
     1745.77
    ],
    [
     2251.41,
     1745.77
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "stearic-acid-neutralization|in|stearic-acid": {
   "reaction": "stearic-acid-neutralization",
   "dir": "in",
   "compound": "stearic-acid",
   "tier": "primary",
   "points": [
    [
     1358.91,
     2150.64
    ],
    [
     1374.91,
     2150.64
    ],
    [
     1370.94,
     2173.98
    ],
    [
     1378.94,
     2173.98
    ],
    [
     1406.94,
     2173.98
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "stearic-acid-neutralization|out|sodium-stearate": {
   "reaction": "stearic-acid-neutralization",
   "dir": "out",
   "compound": "sodium-stearate",
   "tier": "primary",
   "points": [
    [
     1406.94,
     2378.17
    ],
    [
     1406.94,
     2362.17
    ],
    [
     1370.94,
     2362.17
    ],
    [
     1370.94,
     2173.98
    ],
    [
     1378.94,
     2173.98
    ],
    [
     1406.94,
     2173.98
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "oleic-acid-neutralization|in|oleic-acid": {
   "reaction": "oleic-acid-neutralization",
   "dir": "in",
   "compound": "oleic-acid",
   "tier": "primary",
   "points": [
    [
     2765.05,
     1790.05
    ],
    [
     2765.0499999999997,
     1806.05
    ],
    [
     2750,
     1820
    ],
    [
     2750,
     1880
    ],
    [
     2828.21,
     1920.14
    ],
    [
     2836.21,
     1920.14
    ],
    [
     2864.21,
     1920.14
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "oleic-acid-neutralization|out|sodium-oleate": {
   "reaction": "oleic-acid-neutralization",
   "dir": "out",
   "compound": "sodium-oleate",
   "tier": "primary",
   "points": [
    [
     2960.27,
     1925.14
    ],
    [
     2944.27,
     1925.14
    ],
    [
     2873.13,
     1942.42
    ],
    [
     2864.21,
     1920.14
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzene-nitration|in|benzene": {
   "reaction": "benzene-nitration",
   "dir": "in",
   "compound": "benzene",
   "tier": "primary",
   "points": [
    [
     1902.7,
     1372.2
    ],
    [
     1902.7,
     1388.2
    ],
    [
     1870,
     1480
    ],
    [
     1870,
     1530
    ],
    [
     1890,
     1560
    ],
    [
     1890,
     1760
    ],
    [
     1780.74,
     1797.75
    ],
    [
     1788.74,
     1797.75
    ],
    [
     1816.74,
     1797.75
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzene-nitration|out|nitrobenzene": {
   "reaction": "benzene-nitration",
   "dir": "out",
   "compound": "nitrobenzene",
   "tier": "primary",
   "points": [
    [
     1816.74,
     2208.28
    ],
    [
     1816.74,
     2192.28
    ],
    [
     1900,
     2100
    ],
    [
     1900,
     2060
    ],
    [
     1850,
     2040
    ],
    [
     1850,
     1860
    ],
    [
     1780.74,
     1797.75
    ],
    [
     1788.74,
     1797.75
    ],
    [
     1816.74,
     1797.75
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzene-sulfonation|in|benzene": {
   "reaction": "benzene-sulfonation",
   "dir": "in",
   "compound": "benzene",
   "tier": "primary",
   "points": [
    [
     1879.82,
     1369.48
    ],
    [
     1863.82,
     1369.48
    ],
    [
     1860,
     1380
    ],
    [
     1840,
     1400
    ],
    [
     1710,
     1410
    ],
    [
     1700,
     1470
    ],
    [
     1570,
     1560
    ],
    [
     1570,
     1630
    ],
    [
     1420,
     1670
    ],
    [
     1411.56,
     1684.46
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzene-sulfonation|out|benzenesulfonic-acid": {
   "reaction": "benzene-sulfonation",
   "dir": "out",
   "compound": "benzenesulfonic-acid",
   "tier": "primary",
   "points": [
    [
     1318.7,
     1867.84
    ],
    [
     1318.6999999999998,
     1851.84
    ],
    [
     1320,
     1730
    ],
    [
     1360,
     1720
    ],
    [
     1375.56,
     1684.46
    ],
    [
     1383.56,
     1684.46
    ],
    [
     1411.56,
     1684.46
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzene-chlorination|in|benzene": {
   "reaction": "benzene-chlorination",
   "dir": "in",
   "compound": "benzene",
   "tier": "primary",
   "points": [
    [
     1890.7,
     1372.2
    ],
    [
     1890.7,
     1388.2
    ],
    [
     1840,
     1540
    ],
    [
     1730,
     1560
    ],
    [
     1720,
     1610
    ],
    [
     1670,
     1710
    ],
    [
     1598.3,
     1735.36
    ],
    [
     1606.3,
     1735.36
    ],
    [
     1634.3,
     1735.36
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzene-chlorination|out|chlorobenzene": {
   "reaction": "benzene-chlorination",
   "dir": "out",
   "compound": "chlorobenzene",
   "tier": "primary",
   "points": [
    [
     1766.63,
     2063.23
    ],
    [
     1766.63,
     2047.23
    ],
    [
     1800,
     1960
    ],
    [
     1800,
     1920
    ],
    [
     1700,
     1910
    ],
    [
     1670,
     1850
    ],
    [
     1630,
     1830
    ],
    [
     1598.3,
     1735.36
    ],
    [
     1606.3,
     1735.36
    ],
    [
     1634.3,
     1735.36
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "nitrobenzene-reduction|in|nitrobenzene": {
   "reaction": "nitrobenzene-reduction",
   "dir": "in",
   "compound": "nitrobenzene",
   "tier": "primary",
   "points": [
    [
     1789.97,
     2242.28
    ],
    [
     1789.97,
     2258.28
    ],
    [
     1770,
     2340
    ],
    [
     1698.86,
     2372.34
    ],
    [
     1706.86,
     2372.34
    ],
    [
     1734.86,
     2372.34
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "nitrobenzene-reduction|out|aniline": {
   "reaction": "nitrobenzene-reduction",
   "dir": "out",
   "compound": "aniline",
   "tier": "primary",
   "points": [
    [
     1686.76,
     2372.34
    ],
    [
     1702.76,
     2372.34
    ],
    [
     1698.86,
     2372.34
    ],
    [
     1706.86,
     2372.34
    ],
    [
     1734.86,
     2372.34
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "aniline-hydrochloride|in|aniline": {
   "reaction": "aniline-hydrochloride",
   "dir": "in",
   "compound": "aniline",
   "tier": "primary",
   "points": [
    [
     1550.76,
     2357.2
    ],
    [
     1534.76,
     2357.2
    ],
    [
     1247.94,
     2357.2
    ],
    [
     1247.94,
     2245.26
    ],
    [
     1255.94,
     2245.26
    ],
    [
     1283.94,
     2245.26
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "aniline-hydrochloride|out|aniline-hydrochloride": {
   "reaction": "aniline-hydrochloride",
   "dir": "out",
   "compound": "aniline-hydrochloride",
   "tier": "primary",
   "points": [
    [
     1283.94,
     2364.29
    ],
    [
     1283.94,
     2348.29
    ],
    [
     1247.94,
     2245.26
    ],
    [
     1255.94,
     2245.26
    ],
    [
     1283.94,
     2245.26
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phenol-bromination|in|phenol": {
   "reaction": "phenol-bromination",
   "dir": "in",
   "compound": "phenol",
   "tier": "primary",
   "points": [
    [
     2370.14,
     1907.5
    ],
    [
     2370.14,
     1923.5
    ],
    [
     2333.78,
     2090.54
    ],
    [
     2321.9,
     2111.4
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phenol-bromination|out|2,4,6-tribromophenol": {
   "reaction": "phenol-bromination",
   "dir": "out",
   "compound": "2,4,6-tribromophenol",
   "tier": "primary",
   "points": [
    [
     2508.4,
     2111.4
    ],
    [
     2492.4,
     2111.4
    ],
    [
     2312.57,
     2133.51
    ],
    [
     2321.9,
     2111.4
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phenol-nitration|in|phenol": {
   "reaction": "phenol-nitration",
   "dir": "in",
   "compound": "phenol",
   "tier": "primary",
   "points": [
    [
     2462.36,
     1907.5
    ],
    [
     2462.36,
     1923.5
    ],
    [
     2426.36,
     1963.33
    ],
    [
     2434.36,
     1963.33
    ],
    [
     2462.36,
     1963.33
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phenol-nitration|out|picric-acid": {
   "reaction": "phenol-nitration",
   "dir": "out",
   "compound": "picric-acid",
   "tier": "primary",
   "points": [
    [
     2604.82,
     2169.78
    ],
    [
     2588.82,
     2169.7799999999997
    ],
    [
     2500,
     2140
    ],
    [
     2500,
     2090
    ],
    [
     2530,
     2060
    ],
    [
     2530,
     2000
    ],
    [
     2426.36,
     1963.33
    ],
    [
     2434.36,
     1963.33
    ],
    [
     2462.36,
     1963.33
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phenol-phthalein|in|phenol": {
   "reaction": "phenol-phthalein",
   "dir": "in",
   "compound": "phenol",
   "tier": "primary",
   "points": [
    [
     2356.06,
     1904.78
    ],
    [
     2340.06,
     1904.78
    ],
    [
     2290,
     1930
    ],
    [
     2220,
     1930
    ],
    [
     2190,
     1980
    ],
    [
     2131.72,
     2035.2
    ],
    [
     2139.72,
     2035.2
    ],
    [
     2167.72,
     2035.2
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phenol-phthalein|in|phthalic-anhydride": {
   "reaction": "phenol-phthalein",
   "dir": "in",
   "compound": "phthalic-anhydride",
   "tier": "primary",
   "points": [
    [
     2167.72,
     1805.61
    ],
    [
     2167.72,
     1821.61
    ],
    [
     2120,
     1830
    ],
    [
     2120,
     1970
    ],
    [
     2130,
     1980
    ],
    [
     2131.72,
     2035.2
    ],
    [
     2139.72,
     2035.2
    ],
    [
     2167.72,
     2035.2
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phenol-phthalein|out|phenolphthalein": {
   "reaction": "phenol-phthalein",
   "dir": "out",
   "compound": "phenolphthalein",
   "tier": "primary",
   "points": [
    [
     2147.96,
     2230.74
    ],
    [
     2147.96,
     2214.74
    ],
    [
     2150,
     2130
    ],
    [
     2220,
     2130
    ],
    [
     2200,
     2060
    ],
    [
     2170,
     2050
    ],
    [
     2167.72,
     2035.2
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "aniline-diazotization|in|aniline": {
   "reaction": "aniline-diazotization",
   "dir": "in",
   "compound": "aniline",
   "tier": "primary",
   "points": [
    [
     1686.76,
     2357.2
    ],
    [
     1702.76,
     2357.2
    ],
    [
     1720,
     2340
    ],
    [
     1780,
     2330
    ],
    [
     1820,
     2270
    ],
    [
     2090,
     2200
    ],
    [
     2127.98,
     2175.09
    ],
    [
     2135.98,
     2175.09
    ],
    [
     2163.98,
     2175.09
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "aniline-diazotization|out|benzenediazonium-chloride": {
   "reaction": "aniline-diazotization",
   "dir": "out",
   "compound": "benzenediazonium-chloride",
   "tier": "primary",
   "points": [
    [
     2582.46,
     1940.12
    ],
    [
     2566.46,
     1940.12
    ],
    [
     2550,
     1930
    ],
    [
     2450,
     1930
    ],
    [
     2330,
     2080
    ],
    [
     2300,
     2080
    ],
    [
     2127.98,
     2175.09
    ],
    [
     2135.98,
     2175.09
    ],
    [
     2163.98,
     2175.09
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "diazonium-phenol-coupling|in|benzenediazonium-chloride": {
   "reaction": "diazonium-phenol-coupling",
   "dir": "in",
   "compound": "benzenediazonium-chloride",
   "tier": "primary",
   "points": [
    [
     2582.46,
     1945.4
    ],
    [
     2566.46,
     1945.3999999999999
    ],
    [
     2560,
     2000
    ],
    [
     2380,
     2030
    ],
    [
     2365.74,
     2037.43
    ],
    [
     2373.74,
     2037.43
    ],
    [
     2401.74,
     2037.43
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "diazonium-phenol-coupling|in|phenol": {
   "reaction": "diazonium-phenol-coupling",
   "dir": "in",
   "compound": "phenol",
   "tier": "primary",
   "points": [
    [
     2401.74,
     1907.5
    ],
    [
     2401.74,
     1923.5
    ],
    [
     2365.74,
     2037.43
    ],
    [
     2373.74,
     2037.43
    ],
    [
     2401.74,
     2037.43
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "diazonium-phenol-coupling|out|p-hydroxyazobenzene": {
   "reaction": "diazonium-phenol-coupling",
   "dir": "out",
   "compound": "p-hydroxyazobenzene",
   "tier": "primary",
   "points": [
    [
     2158.94,
     2378.51
    ],
    [
     2174.94,
     2378.5099999999998
    ],
    [
     2220,
     2350
    ],
    [
     2270,
     2350
    ],
    [
     2330,
     2260
    ],
    [
     2320,
     2160
    ],
    [
     2300,
     2120
    ],
    [
     2310,
     2070
    ],
    [
     2340,
     2070
    ],
    [
     2365.74,
     2037.43
    ],
    [
     2373.74,
     2037.43
    ],
    [
     2401.74,
     2037.43
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "aniline-acetic-anhydride|in|aniline": {
   "reaction": "aniline-acetic-anhydride",
   "dir": "in",
   "compound": "aniline",
   "tier": "primary",
   "points": [
    [
     1686.76,
     2369.2
    ],
    [
     1702.76,
     2369.2
    ],
    [
     1730,
     2330
    ],
    [
     1780,
     2330
    ],
    [
     1840,
     2250
    ],
    [
     1920,
     2250
    ],
    [
     2040,
     2160
    ],
    [
     2070,
     2070
    ],
    [
     2130,
     2040
    ],
    [
     2180,
     1970
    ],
    [
     2210,
     1960
    ],
    [
     2230,
     1920
    ],
    [
     2320,
     1920
    ],
    [
     2380,
     1820
    ],
    [
     2390,
     1770
    ],
    [
     2430,
     1700
    ],
    [
     2518.33,
     1609.34
    ],
    [
     2526.33,
     1609.34
    ],
    [
     2554.33,
     1609.34
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "aniline-acetic-anhydride|in|acetic-anhydride": {
   "reaction": "aniline-acetic-anhydride",
   "dir": "in",
   "compound": "acetic-anhydride",
   "tier": "primary",
   "points": [
    [
     2555.22,
     1553.31
    ],
    [
     2555.22,
     1569.31
    ],
    [
     2518.33,
     1609.34
    ],
    [
     2526.33,
     1609.34
    ],
    [
     2554.33,
     1609.34
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "aniline-acetic-anhydride|out|acetanilide": {
   "reaction": "aniline-acetic-anhydride",
   "dir": "out",
   "compound": "acetanilide",
   "tier": "primary",
   "points": [
    [
     2725.43,
     1476.53
    ],
    [
     2709.43,
     1476.53
    ],
    [
     2690,
     1560
    ],
    [
     2518.33,
     1609.34
    ],
    [
     2526.33,
     1609.34
    ],
    [
     2554.33,
     1609.34
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cumene-oxidation|in|cumene": {
   "reaction": "cumene-oxidation",
   "dir": "in",
   "compound": "cumene",
   "tier": "primary",
   "points": [
    [
     1996.29,
     1200.3
    ],
    [
     1996.2900000000002,
     1216.3
    ],
    [
     2020,
     1340
    ],
    [
     2020,
     1380
    ],
    [
     2000,
     1400
    ],
    [
     1950,
     1530
    ],
    [
     1910,
     1550
    ],
    [
     1910,
     1830
    ],
    [
     1851.91,
     1871.5
    ],
    [
     1859.91,
     1871.5
    ],
    [
     1887.91,
     1871.5
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cumene-oxidation|out|cumene-hydroperoxide": {
   "reaction": "cumene-oxidation",
   "dir": "out",
   "compound": "cumene-hydroperoxide",
   "tier": "primary",
   "points": [
    [
     1887.91,
     2146.75
    ],
    [
     1887.91,
     2130.75
    ],
    [
     1900,
     2070
    ],
    [
     1880,
     2040
    ],
    [
     1850,
     2040
    ],
    [
     1851.91,
     1871.5
    ],
    [
     1859.91,
     1871.5
    ],
    [
     1887.91,
     1871.5
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cumene-hydroperoxide-decomposition|in|cumene-hydroperoxide": {
   "reaction": "cumene-hydroperoxide-decomposition",
   "dir": "in",
   "compound": "cumene-hydroperoxide",
   "tier": "primary",
   "points": [
    [
     1996.34,
     2146.75
    ],
    [
     1996.3400000000001,
     2130.75
    ],
    [
     2050,
     2120
    ],
    [
     2050,
     1980
    ],
    [
     2098.03,
     1935.74
    ],
    [
     2106.03,
     1935.74
    ],
    [
     2134.03,
     1935.74
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cumene-hydroperoxide-decomposition|out|phenol": {
   "reaction": "cumene-hydroperoxide-decomposition",
   "dir": "out",
   "compound": "phenol",
   "tier": "primary",
   "points": [
    [
     2356.06,
     1904.78
    ],
    [
     2340.06,
     1904.78
    ],
    [
     2310,
     1920
    ],
    [
     2140,
     1920
    ],
    [
     2098.03,
     1935.74
    ],
    [
     2106.03,
     1935.74
    ],
    [
     2134.03,
     1935.74
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cumene-hydroperoxide-decomposition|out|acetone": {
   "reaction": "cumene-hydroperoxide-decomposition",
   "dir": "out",
   "compound": "acetone",
   "tier": "primary",
   "points": [
    [
     2134.03,
     1417.18
    ],
    [
     2134.03,
     1433.18
    ],
    [
     2110,
     1440
    ],
    [
     2050,
     1540
    ],
    [
     2020,
     1540
    ],
    [
     2020,
     1610
    ],
    [
     2040,
     1620
    ],
    [
     2060,
     1810
    ],
    [
     2100,
     1840
    ],
    [
     2098.03,
     1935.74
    ],
    [
     2106.03,
     1935.74
    ],
    [
     2134.03,
     1935.74
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phenol-acid-neutralization|in|phenol": {
   "reaction": "phenol-acid-neutralization",
   "dir": "in",
   "compound": "phenol",
   "tier": "primary",
   "points": [
    [
     2517.98,
     1907.5
    ],
    [
     2517.98,
     1923.5
    ],
    [
     2559.75,
     1923.5
    ],
    [
     2559.75,
     2044.18
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phenol-acid-neutralization|out|sodium-phenoxide": {
   "reaction": "phenol-acid-neutralization",
   "dir": "out",
   "compound": "sodium-phenoxide",
   "tier": "primary",
   "points": [
    [
     2706.16,
     2007.42
    ],
    [
     2690.16,
     2007.42
    ],
    [
     2523.75,
     2044.18
    ],
    [
     2531.75,
     2044.18
    ],
    [
     2559.75,
     2044.18
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sodium-phenoxide-carboxylation|in|sodium-phenoxide": {
   "reaction": "sodium-phenoxide-carboxylation",
   "dir": "in",
   "compound": "sodium-phenoxide",
   "tier": "secondary",
   "points": [
    [
     2706.16,
     2007.42
    ],
    [
     2690.16,
     2007.42
    ],
    [
     2630,
     2050
    ],
    [
     2620,
     2090
    ],
    [
     2500,
     2090
    ],
    [
     2400,
     2160
    ],
    [
     2340,
     2160
    ],
    [
     2230,
     2220
    ],
    [
     2170,
     2230
    ],
    [
     2160,
     2280
    ],
    [
     2108.78,
     2320.64
    ],
    [
     2116.78,
     2320.64
    ],
    [
     2144.78,
     2320.64
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sodium-phenoxide-carboxylation|out|sodium-salicylate": {
   "reaction": "sodium-phenoxide-carboxylation",
   "dir": "out",
   "compound": "sodium-salicylate",
   "tier": "secondary",
   "points": [
    [
     1751.07,
     2218.53
    ],
    [
     1767.07,
     2218.53
    ],
    [
     1770,
     2250
    ],
    [
     2100,
     2290
    ],
    [
     2108.78,
     2320.64
    ],
    [
     2116.78,
     2320.64
    ],
    [
     2144.78,
     2320.64
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sodium-salicylate-acidification|in|sodium-salicylate": {
   "reaction": "sodium-salicylate-acidification",
   "dir": "in",
   "compound": "sodium-salicylate",
   "tier": "secondary",
   "points": [
    [
     1751.07,
     2189.97
    ],
    [
     1767.07,
     2189.97
    ],
    [
     2065.62,
     2189.97
    ],
    [
     2065.62,
     2009.76
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sodium-salicylate-acidification|out|salicylic-acid": {
   "reaction": "sodium-salicylate-acidification",
   "dir": "out",
   "compound": "salicylic-acid",
   "tier": "secondary",
   "points": [
    [
     2512.86,
     1696.63
    ],
    [
     2496.86,
     1696.6299999999999
    ],
    [
     2400,
     1730
    ],
    [
     2310,
     1780
    ],
    [
     2240,
     1790
    ],
    [
     2200,
     1890
    ],
    [
     2110,
     1910
    ],
    [
     2029.62,
     2009.76
    ],
    [
     2037.62,
     2009.76
    ],
    [
     2065.62,
     2009.76
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sucrose-hydrolysis|in|sucrose": {
   "reaction": "sucrose-hydrolysis",
   "dir": "in",
   "compound": "sucrose",
   "tier": "primary",
   "points": [
    [
     2033.45,
     2730.76
    ],
    [
     2033.45,
     2714.76
    ],
    [
     2139.49,
     2714.76
    ],
    [
     2139.49,
     2538.73
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sucrose-hydrolysis|out|glucose": {
   "reaction": "sucrose-hydrolysis",
   "dir": "out",
   "compound": "glucose",
   "tier": "primary",
   "points": [
    [
     2201.06,
     2409.27
    ],
    [
     2201.06,
     2425.27
    ],
    [
     2139.49,
     2538.73
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sucrose-hydrolysis|out|fructose": {
   "reaction": "sucrose-hydrolysis",
   "dir": "out",
   "compound": "fructose",
   "tier": "primary",
   "points": [
    [
     2336.42,
     2492.29
    ],
    [
     2320.42,
     2492.29
    ],
    [
     2103.49,
     2538.73
    ],
    [
     2111.49,
     2538.73
    ],
    [
     2139.49,
     2538.73
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "maltose-hydrolysis|in|maltose": {
   "reaction": "maltose-hydrolysis",
   "dir": "in",
   "compound": "maltose",
   "tier": "secondary",
   "points": [
    [
     2520.62,
     2470.05
    ],
    [
     2520.62,
     2454.05
    ],
    [
     2544.72,
     2403.87
    ],
    [
     2517.18,
     2330.89
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "maltose-hydrolysis|out|glucose": {
   "reaction": "maltose-hydrolysis",
   "dir": "out",
   "compound": "glucose",
   "tier": "secondary",
   "points": [
    [
     2362.98,
     2389.99
    ],
    [
     2378.98,
     2389.99
    ],
    [
     2517.18,
     2330.89
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "lactose-hydrolysis|in|lactose": {
   "reaction": "lactose-hydrolysis",
   "dir": "in",
   "compound": "lactose",
   "tier": "secondary",
   "points": [
    [
     2640.04,
     2344.49
    ],
    [
     2624.04,
     2344.4900000000002
    ],
    [
     2610,
     2360
    ],
    [
     2400,
     2400
    ],
    [
     2393.17,
     2404.99
    ],
    [
     2401.17,
     2404.99
    ],
    [
     2429.17,
     2404.99
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "lactose-hydrolysis|out|glucose": {
   "reaction": "lactose-hydrolysis",
   "dir": "out",
   "compound": "glucose",
   "tier": "secondary",
   "points": [
    [
     2362.98,
     2404.99
    ],
    [
     2378.98,
     2404.99
    ],
    [
     2393.17,
     2404.99
    ],
    [
     2401.17,
     2404.99
    ],
    [
     2429.17,
     2404.99
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "lactose-hydrolysis|out|galactose": {
   "reaction": "lactose-hydrolysis",
   "dir": "out",
   "compound": "galactose",
   "tier": "secondary",
   "points": [
    [
     2429.17,
     2539.93
    ],
    [
     2429.17,
     2523.93
    ],
    [
     2480,
     2500
    ],
    [
     2480,
     2450
    ],
    [
     2393.17,
     2404.99
    ],
    [
     2401.17,
     2404.99
    ],
    [
     2429.17,
     2404.99
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "starch-hydrolysis-maltose|in|starch": {
   "reaction": "starch-hydrolysis-maltose",
   "dir": "in",
   "compound": "starch",
   "tier": "primary",
   "points": [
    [
     1894.46,
     2552.32
    ],
    [
     1910.46,
     2552.32
    ],
    [
     2006.88,
     2612.86
    ],
    [
     2014.88,
     2612.86
    ],
    [
     2042.88,
     2612.86
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "starch-hydrolysis-maltose|out|maltose": {
   "reaction": "starch-hydrolysis-maltose",
   "dir": "out",
   "compound": "maltose",
   "tier": "primary",
   "points": [
    [
     2509.74,
     2501.33
    ],
    [
     2493.74,
     2501.3300000000004
    ],
    [
     2120,
     2510
    ],
    [
     2030,
     2600
    ],
    [
     2006.88,
     2612.86
    ],
    [
     2014.88,
     2612.86
    ],
    [
     2042.88,
     2612.86
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "starch-hydrolysis-glucose|in|starch": {
   "reaction": "starch-hydrolysis-glucose",
   "dir": "in",
   "compound": "starch",
   "tier": "primary",
   "points": [
    [
     1894.46,
     2538.76
    ],
    [
     1910.46,
     2538.76
    ],
    [
     1932.99,
     2538.76
    ],
    [
     1940.99,
     2538.76
    ],
    [
     1968.99,
     2538.76
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "starch-hydrolysis-glucose|out|glucose": {
   "reaction": "starch-hydrolysis-glucose",
   "dir": "out",
   "compound": "glucose",
   "tier": "primary",
   "points": [
    [
     2186.98,
     2401.27
    ],
    [
     2170.98,
     2401.27
    ],
    [
     2150,
     2430
    ],
    [
     2040,
     2430
    ],
    [
     2000,
     2510
    ],
    [
     1932.99,
     2538.76
    ],
    [
     1940.99,
     2538.76
    ],
    [
     1968.99,
     2538.76
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cellulose-hydrolysis|in|cellulose": {
   "reaction": "cellulose-hydrolysis",
   "dir": "in",
   "compound": "cellulose",
   "tier": "secondary",
   "points": [
    [
     2057.58,
     2326.58
    ],
    [
     2057.58,
     2342.58
    ],
    [
     2020,
     2370
    ],
    [
     2021.58,
     2464.65
    ],
    [
     2029.58,
     2464.65
    ],
    [
     2057.58,
     2464.65
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cellulose-hydrolysis|out|glucose": {
   "reaction": "cellulose-hydrolysis",
   "dir": "out",
   "compound": "glucose",
   "tier": "secondary",
   "points": [
    [
     2186.98,
     2406.55
    ],
    [
     2170.98,
     2406.55
    ],
    [
     2102.31,
     2528.55
    ],
    [
     2057.58,
     2464.65
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glucose-reduction|in|glucose": {
   "reaction": "glucose-reduction",
   "dir": "in",
   "compound": "glucose",
   "tier": "secondary",
   "points": [
    [
     2186.98,
     2406.55
    ],
    [
     2170.98,
     2406.55
    ],
    [
     2150,
     2420
    ],
    [
     1810,
     2430
    ],
    [
     1800.89,
     2444.69
    ],
    [
     1808.89,
     2444.69
    ],
    [
     1836.89,
     2444.69
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glucose-reduction|out|sorbitol": {
   "reaction": "glucose-reduction",
   "dir": "out",
   "compound": "sorbitol",
   "tier": "secondary",
   "points": [
    [
     1221.52,
     2273.15
    ],
    [
     1237.52,
     2273.15
    ],
    [
     1550,
     2400
    ],
    [
     1780,
     2420
    ],
    [
     1800.89,
     2444.69
    ],
    [
     1808.89,
     2444.69
    ],
    [
     1836.89,
     2444.69
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glucose-fermentation|in|glucose": {
   "reaction": "glucose-fermentation",
   "dir": "in",
   "compound": "glucose",
   "tier": "primary",
   "points": [
    [
     2201.06,
     2375.27
    ],
    [
     2201.06,
     2359.27
    ],
    [
     2130,
     2350
    ],
    [
     2130,
     2290
    ],
    [
     2170,
     2260
    ],
    [
     2160,
     2210
    ],
    [
     2050,
     2120
    ],
    [
     2040,
     2050
    ],
    [
     1960,
     1960
    ],
    [
     1927.58,
     1945.43
    ],
    [
     1935.58,
     1945.43
    ],
    [
     1963.58,
     1945.43
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glucose-fermentation|out|ethanol": {
   "reaction": "glucose-fermentation",
   "dir": "out",
   "compound": "ethanol",
   "tier": "primary",
   "points": [
    [
     1834.76,
     1383.51
    ],
    [
     1834.76,
     1399.51
    ],
    [
     1870,
     1410
    ],
    [
     1870,
     1530
    ],
    [
     1890,
     1560
    ],
    [
     1910,
     1780
    ],
    [
     1940,
     1840
    ],
    [
     1960,
     1840
    ],
    [
     1960,
     1900
    ],
    [
     1927.58,
     1945.43
    ],
    [
     1935.58,
     1945.43
    ],
    [
     1963.58,
     1945.43
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cellulose-acetylation|in|cellulose": {
   "reaction": "cellulose-acetylation",
   "dir": "in",
   "compound": "cellulose",
   "tier": "secondary",
   "points": [
    [
     2085.8,
     2292.58
    ],
    [
     2085.8,
     2276.58
    ],
    [
     2020,
     2270
    ],
    [
     2020,
     2150
    ],
    [
     2050,
     2110
    ],
    [
     2050,
     1960
    ],
    [
     2100,
     1900
    ],
    [
     2099.03,
     1861.71
    ],
    [
     2107.03,
     1861.71
    ],
    [
     2135.03,
     1861.71
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cellulose-acetylation|in|acetic-anhydride": {
   "reaction": "cellulose-acetylation",
   "dir": "in",
   "compound": "acetic-anhydride",
   "tier": "secondary",
   "points": [
    [
     2544.34,
     1550.59
    ],
    [
     2528.34,
     1550.59
    ],
    [
     2470,
     1650
    ],
    [
     2310,
     1780
    ],
    [
     2240,
     1790
    ],
    [
     2099.03,
     1861.71
    ],
    [
     2107.03,
     1861.71
    ],
    [
     2135.03,
     1861.71
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cellulose-acetylation|out|cellulose-acetate": {
   "reaction": "cellulose-acetylation",
   "dir": "out",
   "compound": "cellulose-acetate",
   "tier": "secondary",
   "points": [
    [
     1990.19,
     2003.9
    ],
    [
     2006.19,
     2003.9
    ],
    [
     2135.03,
     1861.71
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cellulose-acetylation|out|acetic-acid": {
   "reaction": "cellulose-acetylation",
   "dir": "out",
   "compound": "acetic-acid",
   "tier": "secondary",
   "points": [
    [
     2127.9,
     1475.38
    ],
    [
     2127.9,
     1491.38
    ],
    [
     2140,
     1550
    ],
    [
     2140,
     1690
    ],
    [
     2060,
     1700
    ],
    [
     2060,
     1810
    ],
    [
     2100,
     1840
    ],
    [
     2099.03,
     1861.71
    ],
    [
     2107.03,
     1861.71
    ],
    [
     2135.03,
     1861.71
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cellulose-nitration|in|cellulose": {
   "reaction": "cellulose-nitration",
   "dir": "in",
   "compound": "cellulose",
   "tier": "secondary",
   "points": [
    [
     1971.56,
     2326.58
    ],
    [
     1971.56,
     2342.58
    ],
    [
     2000,
     2350
    ],
    [
     2000,
     2400
    ],
    [
     1940,
     2450
    ],
    [
     1938.91,
     2464.84
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cellulose-nitration|out|cellulose-nitrate": {
   "reaction": "cellulose-nitration",
   "dir": "out",
   "compound": "cellulose-nitrate",
   "tier": "secondary",
   "points": [
    [
     1938.91,
     2594.47
    ],
    [
     1938.91,
     2578.47
    ],
    [
     1902.91,
     2464.84
    ],
    [
     1910.91,
     2464.84
    ],
    [
     1938.91,
     2464.84
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycine-alanine-peptide|in|glycine": {
   "reaction": "glycine-alanine-peptide",
   "dir": "in",
   "compound": "glycine",
   "tier": "primary",
   "points": [
    [
     2181.46,
     3137.48
    ],
    [
     2181.46,
     3121.48
    ],
    [
     2145.46,
     2977.96
    ],
    [
     2153.46,
     2977.96
    ],
    [
     2181.46,
     2977.96
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycine-alanine-peptide|in|alanine": {
   "reaction": "glycine-alanine-peptide",
   "dir": "in",
   "compound": "alanine",
   "tier": "primary",
   "points": [
    [
     2127.6,
     3053.41
    ],
    [
     2127.6,
     3037.41
    ],
    [
     2145.46,
     2977.96
    ],
    [
     2153.46,
     2977.96
    ],
    [
     2181.46,
     2977.96
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycine-alanine-peptide|out|glycylalanine": {
   "reaction": "glycine-alanine-peptide",
   "dir": "out",
   "compound": "glycylalanine",
   "tier": "primary",
   "points": [
    [
     2334.2,
     2890.28
    ],
    [
     2318.2,
     2890.28
    ],
    [
     2145.46,
     2977.96
    ],
    [
     2153.46,
     2977.96
    ],
    [
     2181.46,
     2977.96
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycine-glycine-peptide|in|glycine": {
   "reaction": "glycine-glycine-peptide",
   "dir": "in",
   "compound": "glycine",
   "tier": "secondary",
   "points": [
    [
     2285.36,
     3168.76
    ],
    [
     2301.36,
     3168.76
    ],
    [
     2310.54,
     3215.2
    ],
    [
     2318.54,
     3215.2
    ],
    [
     2346.54,
     3215.2
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycine-glycine-peptide|out|glycylglycine": {
   "reaction": "glycine-glycine-peptide",
   "dir": "out",
   "compound": "glycylglycine",
   "tier": "secondary",
   "points": [
    [
     2514.67,
     2999.73
    ],
    [
     2498.67,
     2999.73
    ],
    [
     2450,
     3090
    ],
    [
     2310.54,
     3215.2
    ],
    [
     2318.54,
     3215.2
    ],
    [
     2346.54,
     3215.2
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "alanine-glycine-peptide|in|alanine": {
   "reaction": "alanine-glycine-peptide",
   "dir": "in",
   "compound": "alanine",
   "tier": "secondary",
   "points": [
    [
     1965.68,
     3084.69
    ],
    [
     1949.68,
     3084.69
    ],
    [
     1830.9,
     3171.38
    ],
    [
     1838.9,
     3171.38
    ],
    [
     1866.9,
     3171.38
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "alanine-glycine-peptide|in|glycine": {
   "reaction": "alanine-glycine-peptide",
   "dir": "in",
   "compound": "glycine",
   "tier": "secondary",
   "points": [
    [
     2091.36,
     3168.76
    ],
    [
     2075.36,
     3168.76
    ],
    [
     1866.84,
     3147.38
    ],
    [
     1866.9,
     3171.38
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "alanine-glycine-peptide|out|alanylglycine": {
   "reaction": "alanine-glycine-peptide",
   "dir": "out",
   "compound": "alanylglycine",
   "tier": "secondary",
   "points": [
    [
     1866.9,
     2999.9
    ],
    [
     1866.9,
     3015.9
    ],
    [
     1830.9,
     3171.38
    ],
    [
     1838.9,
     3171.38
    ],
    [
     1866.9,
     3171.38
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cysteine-oxidation|in|cysteine": {
   "reaction": "cysteine-oxidation",
   "dir": "in",
   "compound": "cysteine",
   "tier": "secondary",
   "points": [
    [
     1559.57,
     3255.62
    ],
    [
     1559.57,
     3239.62
    ],
    [
     1578.13,
     3140.12
    ],
    [
     1586.13,
     3140.12
    ],
    [
     1614.13,
     3140.12
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "cysteine-oxidation|out|cystine": {
   "reaction": "cysteine-oxidation",
   "dir": "out",
   "compound": "cystine",
   "tier": "secondary",
   "points": [
    [
     1664.89,
     3277.83
    ],
    [
     1664.89,
     3261.83
    ],
    [
     1578.13,
     3140.12
    ],
    [
     1586.13,
     3140.12
    ],
    [
     1614.13,
     3140.12
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "protein-hydrolysis|in|protein": {
   "reaction": "protein-hydrolysis",
   "dir": "in",
   "compound": "protein",
   "tier": "secondary",
   "points": [
    [
     1194.49,
     3051.09
    ],
    [
     1194.49,
     3067.09
    ],
    [
     1217.07,
     3191.3
    ],
    [
     1225.07,
     3191.3
    ],
    [
     1253.07,
     3191.3
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycylalanine-hydrolysis|in|glycylalanine": {
   "reaction": "glycylalanine-hydrolysis",
   "dir": "in",
   "compound": "glycylalanine",
   "tier": "primary",
   "points": [
    [
     2334.2,
     2895.56
    ],
    [
     2318.2,
     2895.5600000000004
    ],
    [
     2310,
     3010
    ],
    [
     2190.61,
     3052.06
    ],
    [
     2198.61,
     3052.06
    ],
    [
     2226.61,
     3052.06
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycylalanine-hydrolysis|out|glycine": {
   "reaction": "glycylalanine-hydrolysis",
   "dir": "out",
   "compound": "glycine",
   "tier": "primary",
   "points": [
    [
     2226.61,
     3137.48
    ],
    [
     2226.61,
     3121.48
    ],
    [
     2190.61,
     3052.06
    ],
    [
     2198.61,
     3052.06
    ],
    [
     2226.61,
     3052.06
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycylalanine-hydrolysis|out|alanine": {
   "reaction": "glycylalanine-hydrolysis",
   "dir": "out",
   "compound": "alanine",
   "tier": "primary",
   "points": [
    [
     2141.68,
     3056.13
    ],
    [
     2157.68,
     3056.13
    ],
    [
     2190.61,
     3052.06
    ],
    [
     2198.61,
     3052.06
    ],
    [
     2226.61,
     3052.06
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycylglycine-hydrolysis|in|glycylglycine": {
   "reaction": "glycylglycine-hydrolysis",
   "dir": "in",
   "compound": "glycylglycine",
   "tier": "secondary",
   "points": [
    [
     2514.67,
     2999.73
    ],
    [
     2498.67,
     2999.73
    ],
    [
     2480,
     3020
    ],
    [
     2320.71,
     3058.53
    ],
    [
     2328.71,
     3058.53
    ],
    [
     2356.71,
     3058.53
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "glycylglycine-hydrolysis|out|glycine": {
   "reaction": "glycylglycine-hydrolysis",
   "dir": "out",
   "compound": "glycine",
   "tier": "secondary",
   "points": [
    [
     2285.36,
     3140.2
    ],
    [
     2301.36,
     3140.2
    ],
    [
     2320.71,
     3140.2
    ],
    [
     2320.71,
     3058.53
    ],
    [
     2328.71,
     3058.53
    ],
    [
     2356.71,
     3058.53
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "alanylglycine-hydrolysis|in|alanylglycine": {
   "reaction": "alanylglycine-hydrolysis",
   "dir": "in",
   "compound": "alanylglycine",
   "tier": "secondary",
   "points": [
    [
     1950.22,
     2978.21
    ],
    [
     1966.22,
     2978.21
    ],
    [
     1962.32,
     2978.21
    ],
    [
     1970.32,
     2978.21
    ],
    [
     1998.32,
     2978.21
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "alanylglycine-hydrolysis|out|alanine": {
   "reaction": "alanylglycine-hydrolysis",
   "dir": "out",
   "compound": "alanine",
   "tier": "secondary",
   "points": [
    [
     1998.32,
     3053.41
    ],
    [
     1998.32,
     3037.41
    ],
    [
     1962.32,
     2978.21
    ],
    [
     1970.32,
     2978.21
    ],
    [
     1998.32,
     2978.21
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "alanylglycine-hydrolysis|out|glycine": {
   "reaction": "alanylglycine-hydrolysis",
   "dir": "out",
   "compound": "glycine",
   "tier": "secondary",
   "points": [
    [
     2091.36,
     3140.2
    ],
    [
     2075.36,
     3140.2
    ],
    [
     1962.32,
     3140.2
    ],
    [
     1962.32,
     2978.21
    ],
    [
     1970.32,
     2978.21
    ],
    [
     1998.32,
     2978.21
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethene-polymerization|in|ethene": {
   "reaction": "ethene-polymerization",
   "dir": "in",
   "compound": "ethene",
   "tier": "primary",
   "points": [
    [
     2205.7,
     905.99
    ],
    [
     2221.7,
     905.99
    ],
    [
     2310,
     940
    ],
    [
     2320,
     1020
    ],
    [
     2430,
     1090
    ],
    [
     2500,
     1350
    ],
    [
     2550,
     1420
    ],
    [
     2557.94,
     1463.28
    ],
    [
     2565.94,
     1463.28
    ],
    [
     2593.94,
     1463.28
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethene-polymerization|out|polyethylene": {
   "reaction": "ethene-polymerization",
   "dir": "out",
   "compound": "polyethylene",
   "tier": "primary",
   "points": [
    [
     2662.65,
     2038.17
    ],
    [
     2662.65,
     2022.17
    ],
    [
     2580,
     1950
    ],
    [
     2560,
     1720
    ],
    [
     2510,
     1710
    ],
    [
     2510,
     1570
    ],
    [
     2520,
     1560
    ],
    [
     2557.94,
     1463.28
    ],
    [
     2565.94,
     1463.28
    ],
    [
     2593.94,
     1463.28
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propene-polymerization|in|propene": {
   "reaction": "propene-polymerization",
   "dir": "in",
   "compound": "propene",
   "tier": "primary",
   "points": [
    [
     1932.31,
     911.12
    ],
    [
     1932.31,
     927.12
    ],
    [
     1940,
     1040
    ],
    [
     1960,
     1110
    ],
    [
     1990,
     1240
    ],
    [
     2050,
     1360
    ],
    [
     2100,
     1400
    ],
    [
     2130,
     1530
    ],
    [
     2210,
     1700
    ],
    [
     2200.04,
     1963.42
    ],
    [
     2208.04,
     1963.42
    ],
    [
     2236.04,
     1963.42
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propene-polymerization|out|polypropylene": {
   "reaction": "propene-polymerization",
   "dir": "out",
   "compound": "polypropylene",
   "tier": "primary",
   "points": [
    [
     2236.04,
     2230.54
    ],
    [
     2236.04,
     2214.54
    ],
    [
     2270,
     2200
    ],
    [
     2236.04,
     1963.42
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "styrene-polymerization|in|styrene": {
   "reaction": "styrene-polymerization",
   "dir": "in",
   "compound": "styrene",
   "tier": "primary",
   "points": [
    [
     2620.98,
     2741.12
    ],
    [
     2620.98,
     2757.12
    ],
    [
     2624.92,
     2850.18
    ],
    [
     2632.92,
     2850.18
    ],
    [
     2660.92,
     2850.18
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "styrene-polymerization|out|polystyrene": {
   "reaction": "styrene-polymerization",
   "dir": "out",
   "compound": "polystyrene",
   "tier": "primary",
   "points": [
    [
     2834.57,
     2823.35
    ],
    [
     2818.57,
     2823.35
    ],
    [
     2624.92,
     2823.35
    ],
    [
     2624.92,
     2850.18
    ],
    [
     2632.92,
     2850.18
    ],
    [
     2660.92,
     2850.18
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "vinyl-chloride-polymerization|in|vinyl-chloride": {
   "reaction": "vinyl-chloride-polymerization",
   "dir": "in",
   "compound": "vinyl-chloride",
   "tier": "primary",
   "points": [
    [
     2458.2,
     2347.12
    ],
    [
     2458.2,
     2363.12
    ],
    [
     2530,
     2370
    ],
    [
     2520,
     2450
    ],
    [
     2500,
     2470
    ],
    [
     2515.05,
     2560.15
    ],
    [
     2523.05,
     2560.15
    ],
    [
     2551.05,
     2560.15
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "vinyl-chloride-polymerization|out|pvc": {
   "reaction": "vinyl-chloride-polymerization",
   "dir": "out",
   "compound": "pvc",
   "tier": "primary",
   "points": [
    [
     2815.58,
     2371.18
    ],
    [
     2799.58,
     2371.1800000000003
    ],
    [
     2700,
     2400
    ],
    [
     2650,
     2510
    ],
    [
     2515.05,
     2560.15
    ],
    [
     2523.05,
     2560.15
    ],
    [
     2551.05,
     2560.15
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "tetrafluoroethylene-polymerization|in|tetrafluoroethylene": {
   "reaction": "tetrafluoroethylene-polymerization",
   "dir": "in",
   "compound": "tetrafluoroethylene",
   "tier": "secondary",
   "points": [
    [
     1366.21,
     2881.02
    ],
    [
     1382.21,
     2881.02
    ],
    [
     1722.43,
     3124.38
    ],
    [
     1737.19,
     3093.75
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "tetrafluoroethylene-polymerization|out|ptfe": {
   "reaction": "tetrafluoroethylene-polymerization",
   "dir": "out",
   "compound": "ptfe",
   "tier": "secondary",
   "points": [
    [
     2948.5,
     3096.36
    ],
    [
     2932.5,
     3096.36
    ],
    [
     1718.7,
     3109.06
    ],
    [
     1737.19,
     3093.75
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "vinyl-acetate-polymerization|in|vinyl-acetate": {
   "reaction": "vinyl-acetate-polymerization",
   "dir": "in",
   "compound": "vinyl-acetate",
   "tier": "secondary",
   "points": [
    [
     1994.84,
     2385.87
    ],
    [
     2010.84,
     2385.8700000000003
    ],
    [
     2020,
     2420
    ],
    [
     2150,
     2430
    ],
    [
     2180.32,
     2464.63
    ],
    [
     2188.32,
     2464.63
    ],
    [
     2216.32,
     2464.63
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "vinyl-acetate-polymerization|out|pvac": {
   "reaction": "vinyl-acetate-polymerization",
   "dir": "out",
   "compound": "pvac",
   "tier": "secondary",
   "points": [
    [
     2713.31,
     2433.28
    ],
    [
     2697.31,
     2433.28
    ],
    [
     2180.32,
     2433.28
    ],
    [
     2180.32,
     2464.63
    ],
    [
     2188.32,
     2464.63
    ],
    [
     2216.32,
     2464.63
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "mma-polymerization|in|methyl-methacrylate": {
   "reaction": "mma-polymerization",
   "dir": "in",
   "compound": "methyl-methacrylate",
   "tier": "secondary",
   "points": [
    [
     2909.59,
     3123.22
    ],
    [
     2909.59,
     3107.22
    ],
    [
     2978.42,
     2928.29
    ],
    [
     2986.42,
     2928.29
    ],
    [
     3014.42,
     2928.29
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "mma-polymerization|out|pmma": {
   "reaction": "mma-polymerization",
   "dir": "out",
   "compound": "pmma",
   "tier": "secondary",
   "points": [
    [
     3165.6,
     2847.64
    ],
    [
     3149.6,
     2847.64
    ],
    [
     2978.42,
     2928.29
    ],
    [
     2986.42,
     2928.29
    ],
    [
     3014.42,
     2928.29
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acrylonitrile-polymerization|in|acrylonitrile": {
   "reaction": "acrylonitrile-polymerization",
   "dir": "in",
   "compound": "acrylonitrile",
   "tier": "secondary",
   "points": [
    [
     2419.36,
     3394.78
    ],
    [
     2435.36,
     3394.78
    ],
    [
     2475.09,
     3359.48
    ],
    [
     2483.09,
     3359.48
    ],
    [
     2511.09,
     3359.48
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acrylonitrile-polymerization|out|pan": {
   "reaction": "acrylonitrile-polymerization",
   "dir": "out",
   "compound": "pan",
   "tier": "secondary",
   "points": [
    [
     2682.61,
     3359.48
    ],
    [
     2666.61,
     3359.48
    ],
    [
     2515.64,
     3383.04
    ],
    [
     2511.09,
     3359.48
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "butadiene-polymerization|in|butadiene": {
   "reaction": "butadiene-polymerization",
   "dir": "in",
   "compound": "butadiene",
   "tier": "secondary",
   "points": [
    [
     2807.06,
     2540.35
    ],
    [
     2823.06,
     2540.35
    ],
    [
     2819.06,
     2538.66
    ],
    [
     2827.06,
     2538.66
    ],
    [
     2855.06,
     2538.66
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "butadiene-polymerization|out|br": {
   "reaction": "butadiene-polymerization",
   "dir": "out",
   "compound": "br",
   "tier": "secondary",
   "points": [
    [
     2760.21,
     2645.03
    ],
    [
     2776.21,
     2645.03
    ],
    [
     2819.06,
     2645.03
    ],
    [
     2819.06,
     2538.66
    ],
    [
     2827.06,
     2538.66
    ],
    [
     2855.06,
     2538.66
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "chloroprene-polymerization|in|chloroprene": {
   "reaction": "chloroprene-polymerization",
   "dir": "in",
   "compound": "chloroprene",
   "tier": "secondary",
   "points": [
    [
     1412.22,
     3037.02
    ],
    [
     1428.22,
     3037.02
    ],
    [
     1424.32,
     3079.48
    ],
    [
     1432.32,
     3079.48
    ],
    [
     1460.32,
     3079.48
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "chloroprene-polymerization|out|chloroprene-rubber": {
   "reaction": "chloroprene-polymerization",
   "dir": "out",
   "compound": "chloroprene-rubber",
   "tier": "secondary",
   "points": [
    [
     1460.32,
     2903.34
    ],
    [
     1460.32,
     2919.34
    ],
    [
     1424.32,
     3079.48
    ],
    [
     1432.32,
     3079.48
    ],
    [
     1460.32,
     3079.48
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "styrene-butadiene-copolymerization|in|butadiene": {
   "reaction": "styrene-butadiene-copolymerization",
   "dir": "in",
   "compound": "butadiene",
   "tier": "secondary",
   "points": [
    [
     2747.04,
     2571.63
    ],
    [
     2747.04,
     2587.63
    ],
    [
     2783.71,
     2684.92
    ],
    [
     2747.04,
     2732.41
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "styrene-butadiene-copolymerization|in|styrene": {
   "reaction": "styrene-butadiene-copolymerization",
   "dir": "in",
   "compound": "styrene",
   "tier": "secondary",
   "points": [
    [
     2631.86,
     2732.41
    ],
    [
     2647.86,
     2732.41
    ],
    [
     2711.04,
     2732.41
    ],
    [
     2719.04,
     2732.41
    ],
    [
     2747.04,
     2732.41
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "styrene-butadiene-copolymerization|out|sbr": {
   "reaction": "styrene-butadiene-copolymerization",
   "dir": "out",
   "compound": "sbr",
   "tier": "secondary",
   "points": [
    [
     2867.72,
     2653.24
    ],
    [
     2851.72,
     2653.24
    ],
    [
     2711.04,
     2732.41
    ],
    [
     2719.04,
     2732.41
    ],
    [
     2747.04,
     2732.41
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "iir-copolymerization|in|isobutene": {
   "reaction": "iir-copolymerization",
   "dir": "in",
   "compound": "isobutene",
   "tier": "secondary",
   "points": [
    [
     1168.11,
     2586.4
    ],
    [
     1152.11,
     2586.4
    ],
    [
     1041,
     2468.55
    ],
    [
     1049,
     2468.55
    ],
    [
     1077,
     2468.55
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "iir-copolymerization|in|isoprene": {
   "reaction": "iir-copolymerization",
   "dir": "in",
   "compound": "isoprene",
   "tier": "secondary",
   "points": [
    [
     1255.85,
     2524.3
    ],
    [
     1239.85,
     2524.3
    ],
    [
     1041,
     2468.55
    ],
    [
     1049,
     2468.55
    ],
    [
     1077,
     2468.55
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "iir-copolymerization|out|iir": {
   "reaction": "iir-copolymerization",
   "dir": "out",
   "compound": "iir",
   "tier": "secondary",
   "points": [
    [
     1009.69,
     2377.92
    ],
    [
     1009.69,
     2393.92
    ],
    [
     1041,
     2468.55
    ],
    [
     1049,
     2468.55
    ],
    [
     1077,
     2468.55
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "pvac-hydrolysis|in|pvac": {
   "reaction": "pvac-hydrolysis",
   "dir": "in",
   "compound": "pvac",
   "tier": "secondary",
   "points": [
    [
     2724.19,
     2402
    ],
    [
     2724.19,
     2386
    ],
    [
     2630,
     2350
    ],
    [
     2640,
     2300
    ],
    [
     2675.34,
     2257.11
    ],
    [
     2683.34,
     2257.11
    ],
    [
     2711.34,
     2257.11
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "pvac-hydrolysis|out|pva": {
   "reaction": "pvac-hydrolysis",
   "dir": "out",
   "compound": "pva",
   "tier": "secondary",
   "points": [
    [
     2674.33,
     2386.91
    ],
    [
     2674.33,
     2370.91
    ],
    [
     2630,
     2350
    ],
    [
     2640,
     2300
    ],
    [
     2675.34,
     2257.11
    ],
    [
     2683.34,
     2257.11
    ],
    [
     2711.34,
     2257.11
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "pvac-hydrolysis|out|acetic-acid": {
   "reaction": "pvac-hydrolysis",
   "dir": "out",
   "compound": "acetic-acid",
   "tier": "secondary",
   "points": [
    [
     2323.9,
     1475.38
    ],
    [
     2323.9,
     1491.38
    ],
    [
     2340,
     1630
    ],
    [
     2390,
     1650
    ],
    [
     2370,
     1850
    ],
    [
     2350,
     1870
    ],
    [
     2350,
     1910
    ],
    [
     2390,
     2080
    ],
    [
     2430,
     2080
    ],
    [
     2670,
     2260
    ],
    [
     2675.34,
     2257.11
    ],
    [
     2683.34,
     2257.11
    ],
    [
     2711.34,
     2257.11
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "pva-formalization|in|pva": {
   "reaction": "pva-formalization",
   "dir": "in",
   "compound": "pva",
   "tier": "primary",
   "points": [
    [
     2549.21,
     2418.19
    ],
    [
     2533.21,
     2418.19
    ],
    [
     2480,
     2500
    ],
    [
     2239,
     2554.77
    ],
    [
     2247,
     2554.77
    ],
    [
     2275,
     2554.77
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "pva-formalization|out|vinylon": {
   "reaction": "pva-formalization",
   "dir": "out",
   "compound": "vinylon",
   "tier": "primary",
   "points": [
    [
     2124.88,
     2671.5
    ],
    [
     2140.88,
     2671.5
    ],
    [
     2160,
     2580
    ],
    [
     2240,
     2570
    ],
    [
     2239,
     2554.77
    ],
    [
     2247,
     2554.77
    ],
    [
     2275,
     2554.77
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "caprolactam-ring-opening|in|caprolactam": {
   "reaction": "caprolactam-ring-opening",
   "dir": "in",
   "compound": "caprolactam",
   "tier": "primary",
   "points": [
    [
     3082.98,
     2551.37
    ],
    [
     3066.98,
     2551.3700000000003
    ],
    [
     2620,
     2640
    ],
    [
     2270,
     2800
    ],
    [
     2071.18,
     2904.27
    ],
    [
     2079.18,
     2904.27
    ],
    [
     2107.18,
     2904.27
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "caprolactam-ring-opening|out|nylon6": {
   "reaction": "caprolactam-ring-opening",
   "dir": "out",
   "compound": "nylon6",
   "tier": "primary",
   "points": [
    [
     1991.86,
     2833.44
    ],
    [
     2007.86,
     2833.44
    ],
    [
     2071.18,
     2904.27
    ],
    [
     2079.18,
     2904.27
    ],
    [
     2107.18,
     2904.27
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "nylon66-condensation|in|adipic-acid": {
   "reaction": "nylon66-condensation",
   "dir": "in",
   "compound": "adipic-acid",
   "tier": "primary",
   "points": [
    [
     1613.25,
     2600.63
    ],
    [
     1613.25,
     2616.63
    ],
    [
     1613.25,
     2789.09
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "nylon66-condensation|in|hexamethylenediamine": {
   "reaction": "nylon66-condensation",
   "dir": "in",
   "compound": "hexamethylenediamine",
   "tier": "primary",
   "points": [
    [
     1682.55,
     2687.31
    ],
    [
     1666.55,
     2687.31
    ],
    [
     1577.25,
     2789.09
    ],
    [
     1585.25,
     2789.09
    ],
    [
     1613.25,
     2789.09
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "nylon66-condensation|out|nylon66": {
   "reaction": "nylon66-condensation",
   "dir": "out",
   "compound": "nylon66",
   "tier": "primary",
   "points": [
    [
     1694.04,
     2906.52
    ],
    [
     1678.04,
     2906.52
    ],
    [
     1577.25,
     2789.09
    ],
    [
     1585.25,
     2789.09
    ],
    [
     1613.25,
     2789.09
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "pet-condensation|in|terephthalic-acid": {
   "reaction": "pet-condensation",
   "dir": "in",
   "compound": "terephthalic-acid",
   "tier": "primary",
   "points": [
    [
     2698.77,
     3155.87
    ],
    [
     2698.77,
     3139.87
    ],
    [
     2662.77,
     3019.7
    ],
    [
     2670.77,
     3019.7
    ],
    [
     2698.77,
     3019.7
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "pet-condensation|in|ethylene-glycol": {
   "reaction": "pet-condensation",
   "dir": "in",
   "compound": "ethylene-glycol",
   "tier": "primary",
   "points": [
    [
     2592.35,
     3127.82
    ],
    [
     2608.35,
     3127.82
    ],
    [
     2662.77,
     3019.7
    ],
    [
     2670.77,
     3019.7
    ],
    [
     2698.77,
     3019.7
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "pet-condensation|out|pet": {
   "reaction": "pet-condensation",
   "dir": "out",
   "compound": "pet",
   "tier": "primary",
   "points": [
    [
     2779.74,
     2960.88
    ],
    [
     2763.74,
     2960.88
    ],
    [
     2662.77,
     3019.7
    ],
    [
     2670.77,
     3019.7
    ],
    [
     2698.77,
     3019.7
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "nylon6-from-aminoacid|in|6-aminohexanoic-acid": {
   "reaction": "nylon6-from-aminoacid",
   "dir": "in",
   "compound": "6-aminohexanoic-acid",
   "tier": "secondary",
   "points": [
    [
     2443.9,
     2830.17
    ],
    [
     2427.9,
     2830.17
    ],
    [
     2410,
     2840
    ],
    [
     2020,
     2840
    ],
    [
     2010.03,
     2830.17
    ],
    [
     2018.03,
     2830.17
    ],
    [
     2046.03,
     2830.17
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "nylon6-from-aminoacid|out|nylon6": {
   "reaction": "nylon6-from-aminoacid",
   "dir": "out",
   "compound": "nylon6",
   "tier": "secondary",
   "points": [
    [
     1991.86,
     2830.17
    ],
    [
     2007.86,
     2830.17
    ],
    [
     2010.03,
     2830.17
    ],
    [
     2018.03,
     2830.17
    ],
    [
     2046.03,
     2830.17
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "urea-resin-condensation|in|urea": {
   "reaction": "urea-resin-condensation",
   "dir": "in",
   "compound": "urea",
   "tier": "secondary",
   "points": [
    [
     948.54,
     1940.76
    ],
    [
     964.54,
     1940.76
    ],
    [
     1003.67,
     1965.03
    ],
    [
     1011.67,
     1965.03
    ],
    [
     1039.67,
     1965.03
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "urea-resin-condensation|in|formaldehyde": {
   "reaction": "urea-resin-condensation",
   "dir": "in",
   "compound": "formaldehyde",
   "tier": "secondary",
   "points": [
    [
     1217.54,
     1965.03
    ],
    [
     1201.54,
     1965.03
    ],
    [
     1053.63,
     1984.55
    ],
    [
     1039.67,
     1965.03
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "urea-resin-condensation|out|urea-resin": {
   "reaction": "urea-resin-condensation",
   "dir": "out",
   "compound": "urea-resin",
   "tier": "secondary",
   "points": [
    [
     1020.97,
     2115.92
    ],
    [
     1020.97,
     2099.92
    ],
    [
     1003.67,
     1965.03
    ],
    [
     1011.67,
     1965.03
    ],
    [
     1039.67,
     1965.03
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "melamine-resin-condensation|in|melamine": {
   "reaction": "melamine-resin-condensation",
   "dir": "in",
   "compound": "melamine",
   "tier": "secondary",
   "points": [
    [
     1444.73,
     2552.29
    ],
    [
     1444.73,
     2536.29
    ],
    [
     1492.6,
     2383.71
    ],
    [
     1444.73,
     2322.13
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "melamine-resin-condensation|in|formaldehyde": {
   "reaction": "melamine-resin-condensation",
   "dir": "in",
   "compound": "formaldehyde",
   "tier": "secondary",
   "points": [
    [
     1322.66,
     1993.48
    ],
    [
     1322.6599999999999,
     2009.48
    ],
    [
     1320,
     2100
    ],
    [
     1370,
     2120
    ],
    [
     1370,
     2280
    ],
    [
     1408.73,
     2322.13
    ],
    [
     1416.73,
     2322.13
    ],
    [
     1444.73,
     2322.13
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "melamine-resin-condensation|out|melamine-resin": {
   "reaction": "melamine-resin-condensation",
   "dir": "out",
   "compound": "melamine-resin",
   "tier": "secondary",
   "points": [
    [
     1541.94,
     2490.28
    ],
    [
     1541.94,
     2474.28
    ],
    [
     1489.46,
     2386.03
    ],
    [
     1444.73,
     2322.13
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phenol-resin-condensation|in|phenol": {
   "reaction": "phenol-resin-condensation",
   "dir": "in",
   "compound": "phenol",
   "tier": "secondary",
   "points": [
    [
     2356.06,
     1904.78
    ],
    [
     2340.06,
     1904.78
    ],
    [
     2290,
     1930
    ],
    [
     2220,
     1930
    ],
    [
     2190,
     1980
    ],
    [
     2050,
     1980
    ],
    [
     1970,
     2060
    ],
    [
     1950,
     2070
    ],
    [
     1658.95,
     2298.24
    ],
    [
     1666.95,
     2298.24
    ],
    [
     1694.95,
     2298.24
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phenol-resin-condensation|in|formaldehyde": {
   "reaction": "phenol-resin-condensation",
   "dir": "in",
   "compound": "formaldehyde",
   "tier": "secondary",
   "points": [
    [
     1353.54,
     1990.76
    ],
    [
     1369.54,
     1990.76
    ],
    [
     1490,
     2070
    ],
    [
     1500,
     2120
    ],
    [
     1600,
     2170
    ],
    [
     1610,
     2230
    ],
    [
     1658.95,
     2298.24
    ],
    [
     1666.95,
     2298.24
    ],
    [
     1694.95,
     2298.24
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phenol-resin-condensation|out|phenol-resin": {
   "reaction": "phenol-resin-condensation",
   "dir": "out",
   "compound": "phenol-resin",
   "tier": "secondary",
   "points": [
    [
     1694.95,
     2428.31
    ],
    [
     1694.95,
     2412.31
    ],
    [
     1694.95,
     2298.24
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "polyacetylene-polymerization|in|ethyne": {
   "reaction": "polyacetylene-polymerization",
   "dir": "in",
   "compound": "ethyne",
   "tier": "primary",
   "points": [
    [
     2447.51,
     1252.86
    ],
    [
     2447.5099999999998,
     1268.86
    ],
    [
     2480,
     1280
    ],
    [
     2480,
     1400
    ],
    [
     2430,
     1520
    ],
    [
     2416.24,
     1530.86
    ],
    [
     2424.24,
     1530.86
    ],
    [
     2452.24,
     1530.86
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "polyacetylene-polymerization|out|polyacetylene": {
   "reaction": "polyacetylene-polymerization",
   "dir": "out",
   "compound": "polyacetylene",
   "tier": "primary",
   "points": [
    [
     2452.24,
     2167.24
    ],
    [
     2452.24,
     2151.24
    ],
    [
     2530,
     2060
    ],
    [
     2560,
     1980
    ],
    [
     2570,
     1780
    ],
    [
     2560,
     1720
    ],
    [
     2500,
     1700
    ],
    [
     2490,
     1580
    ],
    [
     2416.24,
     1530.86
    ],
    [
     2424.24,
     1530.86
    ],
    [
     2452.24,
     1530.86
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethylbenzene-dehydrogenation|in|ethylbenzene": {
   "reaction": "ethylbenzene-dehydrogenation",
   "dir": "in",
   "compound": "ethylbenzene",
   "tier": "primary",
   "points": [
    [
     2256.14,
     2743.11
    ],
    [
     2272.14,
     2743.11
    ],
    [
     2268.24,
     2704.45
    ],
    [
     2276.24,
     2704.45
    ],
    [
     2304.24,
     2704.45
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethylbenzene-dehydrogenation|out|styrene": {
   "reaction": "ethylbenzene-dehydrogenation",
   "dir": "out",
   "compound": "styrene",
   "tier": "primary",
   "points": [
    [
     2495.86,
     2709.84
    ],
    [
     2479.86,
     2709.84
    ],
    [
     2287.32,
     2687.43
    ],
    [
     2304.24,
     2704.45
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "isobutene-hydrogen-chloride|in|isobutene": {
   "reaction": "isobutene-hydrogen-chloride",
   "dir": "in",
   "compound": "isobutene",
   "tier": "secondary",
   "points": [
    [
     1304.11,
     2612.08
    ],
    [
     1320.11,
     2612.08
    ],
    [
     2188.79,
     2655.28
    ],
    [
     2172.98,
     2612.08
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "isobutene-hydrogen-chloride|out|2-chloro-2-methylpropane": {
   "reaction": "isobutene-hydrogen-chloride",
   "dir": "out",
   "compound": "2-chloro-2-methylpropane",
   "tier": "secondary",
   "points": [
    [
     2331.75,
     2617.07
    ],
    [
     2315.75,
     2617.07
    ],
    [
     2165.91,
     2635.01
    ],
    [
     2172.98,
     2612.08
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propyne-hydration|in|propyne": {
   "reaction": "propyne-hydration",
   "dir": "in",
   "compound": "propyne",
   "tier": "secondary",
   "points": [
    [
     2197.55,
     846.85
    ],
    [
     2197.55,
     862.85
    ],
    [
     2220,
     880
    ],
    [
     2180,
     980
    ],
    [
     2160,
     1020
    ],
    [
     2170,
     1110
    ],
    [
     2197.55,
     1170.7
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propyne-hydration|out|acetone": {
   "reaction": "propyne-hydration",
   "dir": "out",
   "compound": "acetone",
   "tier": "secondary",
   "points": [
    [
     2197.55,
     1383.18
    ],
    [
     2197.55,
     1367.18
    ],
    [
     2190,
     1320
    ],
    [
     2200,
     1220
    ],
    [
     2161.55,
     1170.7
    ],
    [
     2169.55,
     1170.7
    ],
    [
     2197.55,
     1170.7
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "2-methylpropan-2-ol-hydrogen-chloride|in|2-methylpropan-2-ol": {
   "reaction": "2-methylpropan-2-ol-hydrogen-chloride",
   "dir": "in",
   "compound": "2-methylpropan-2-ol",
   "tier": "secondary",
   "points": [
    [
     1610.25,
     2681.92
    ],
    [
     1626.25,
     2681.92
    ],
    [
     1720,
     2700
    ],
    [
     2130,
     2710
    ],
    [
     2145.08,
     2685.41
    ],
    [
     2153.08,
     2685.41
    ],
    [
     2181.08,
     2685.41
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "2-methylpropan-2-ol-hydrogen-chloride|out|2-chloro-2-methylpropane": {
   "reaction": "2-methylpropan-2-ol-hydrogen-chloride",
   "dir": "out",
   "compound": "2-chloro-2-methylpropane",
   "tier": "secondary",
   "points": [
    [
     2331.75,
     2645.63
    ],
    [
     2315.75,
     2645.63
    ],
    [
     2145.08,
     2685.41
    ],
    [
     2153.08,
     2685.41
    ],
    [
     2181.08,
     2685.41
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "2-methylpropan-2-ol-dehydration|in|2-methylpropan-2-ol": {
   "reaction": "2-methylpropan-2-ol-dehydration",
   "dir": "in",
   "compound": "2-methylpropan-2-ol",
   "tier": "secondary",
   "points": [
    [
     1474.25,
     2681.92
    ],
    [
     1458.25,
     2681.92
    ],
    [
     1281.46,
     2681.92
    ],
    [
     1281.46,
     2700.89
    ],
    [
     1289.46,
     2700.89
    ],
    [
     1317.46,
     2700.89
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "2-methylpropan-2-ol-dehydration|out|isobutene": {
   "reaction": "2-methylpropan-2-ol-dehydration",
   "dir": "out",
   "compound": "isobutene",
   "tier": "secondary",
   "points": [
    [
     1293.23,
     2617.68
    ],
    [
     1293.23,
     2633.68
    ],
    [
     1281.46,
     2700.89
    ],
    [
     1289.46,
     2700.89
    ],
    [
     1317.46,
     2700.89
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "p-xylene-oxidation|in|p-xylene": {
   "reaction": "p-xylene-oxidation",
   "dir": "in",
   "compound": "p-xylene",
   "tier": "primary",
   "points": [
    [
     2397.85,
     2836.18
    ],
    [
     2397.85,
     2852.18
    ],
    [
     2330,
     2860
    ],
    [
     2330,
     2910
    ],
    [
     2386.64,
     2984.43
    ],
    [
     2394.64,
     2984.43
    ],
    [
     2422.64,
     2984.43
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "p-xylene-oxidation|out|terephthalic-acid": {
   "reaction": "p-xylene-oxidation",
   "dir": "out",
   "compound": "terephthalic-acid",
   "tier": "primary",
   "points": [
    [
     2620.37,
     3158.59
    ],
    [
     2604.37,
     3158.5899999999997
    ],
    [
     2600,
     3120
    ],
    [
     2386.64,
     2984.43
    ],
    [
     2394.64,
     2984.43
    ],
    [
     2422.64,
     2984.43
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "chlorobenzene-dow-phenol|in|chlorobenzene": {
   "reaction": "chlorobenzene-dow-phenol",
   "dir": "in",
   "compound": "chlorobenzene",
   "tier": "primary",
   "points": [
    [
     1891.75,
     2065.95
    ],
    [
     1907.75,
     2065.95
    ],
    [
     2080,
     2050
    ],
    [
     2170,
     2070
    ],
    [
     2240,
     2070
    ],
    [
     2269.77,
     2037.35
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "chlorobenzene-dow-phenol|out|sodium-phenoxide": {
   "reaction": "chlorobenzene-dow-phenol",
   "dir": "out",
   "compound": "sodium-phenoxide",
   "tier": "primary",
   "points": [
    [
     2706.16,
     2002.14
    ],
    [
     2690.16,
     2002.14
    ],
    [
     2233.77,
     2002.14
    ],
    [
     2233.77,
     2037.35
    ],
    [
     2241.77,
     2037.35
    ],
    [
     2269.77,
     2037.35
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sodium-phenoxide-acidification|in|sodium-phenoxide": {
   "reaction": "sodium-phenoxide-acidification",
   "dir": "in",
   "compound": "sodium-phenoxide",
   "tier": "primary",
   "points": [
    [
     2706.16,
     1978.86
    ],
    [
     2690.16,
     1978.86
    ],
    [
     2567.29,
     1978.86
    ],
    [
     2567.29,
     1858.09
    ],
    [
     2575.29,
     1858.09
    ],
    [
     2603.29,
     1858.09
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sodium-phenoxide-acidification|out|phenol": {
   "reaction": "sodium-phenoxide-acidification",
   "dir": "out",
   "compound": "phenol",
   "tier": "primary",
   "points": [
    [
     2532.06,
     1876.22
    ],
    [
     2548.06,
     1876.22
    ],
    [
     2567.29,
     1858.09
    ],
    [
     2575.29,
     1858.09
    ],
    [
     2603.29,
     1858.09
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyl-propionate-saponification|in|ethyl-propionate": {
   "reaction": "ethyl-propionate-saponification",
   "dir": "in",
   "compound": "ethyl-propionate",
   "tier": "secondary",
   "points": [
    [
     1331.17,
     1417.21
    ],
    [
     1347.17,
     1417.21
    ],
    [
     1381.68,
     1465.25
    ],
    [
     1389.68,
     1465.25
    ],
    [
     1417.68,
     1465.25
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyl-propionate-saponification|out|propionic-acid": {
   "reaction": "ethyl-propionate-saponification",
   "dir": "out",
   "compound": "propionic-acid",
   "tier": "secondary",
   "points": [
    [
     1523.71,
     1442.83
    ],
    [
     1507.71,
     1442.83
    ],
    [
     1381.68,
     1442.83
    ],
    [
     1381.68,
     1465.25
    ],
    [
     1389.68,
     1465.25
    ],
    [
     1417.68,
     1465.25
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyl-propionate-saponification|out|ethanol": {
   "reaction": "ethyl-propionate-saponification",
   "dir": "out",
   "compound": "ethanol",
   "tier": "secondary",
   "points": [
    [
     1639.72,
     1380.79
    ],
    [
     1623.72,
     1380.79
    ],
    [
     1425.02,
     1432.05
    ],
    [
     1417.68,
     1465.25
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "fructose-base-isomerization|in|fructose": {
   "reaction": "fructose-base-isomerization",
   "dir": "in",
   "compound": "fructose",
   "tier": "secondary",
   "points": [
    [
     2461.54,
     2461.01
    ],
    [
     2461.54,
     2445.01
    ],
    [
     2530,
     2440
    ],
    [
     2520,
     2360
    ],
    [
     2500,
     2360
    ],
    [
     2460,
     2290
    ],
    [
     2430.84,
     2256.87
    ],
    [
     2438.84,
     2256.87
    ],
    [
     2466.84,
     2256.87
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "fructose-base-isomerization|out|glucose": {
   "reaction": "fructose-base-isomerization",
   "dir": "out",
   "compound": "glucose",
   "tier": "secondary",
   "points": [
    [
     2362.98,
     2377.99
    ],
    [
     2378.98,
     2377.99
    ],
    [
     2330,
     2350
    ],
    [
     2330,
     2310
    ],
    [
     2430.84,
     2256.87
    ],
    [
     2438.84,
     2256.87
    ],
    [
     2466.84,
     2256.87
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "fructose-base-isomerization|out|mannose": {
   "reaction": "fructose-base-isomerization",
   "dir": "out",
   "compound": "mannose",
   "tier": "secondary",
   "points": [
    [
     2815.87,
     2091.07
    ],
    [
     2799.87,
     2091.07
    ],
    [
     2432.51,
     2226.25
    ],
    [
     2466.84,
     2256.87
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "methanol-cuo-oxidation|in|methanol": {
   "reaction": "methanol-cuo-oxidation",
   "dir": "in",
   "compound": "methanol",
   "tier": "primary",
   "points": [
    [
     1385.64,
     1617.26
    ],
    [
     1385.64,
     1633.26
    ],
    [
     1360.6,
     1727.51
    ],
    [
     1336.26,
     1766.54
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "methanol-cuo-oxidation|out|formaldehyde": {
   "reaction": "methanol-cuo-oxidation",
   "dir": "out",
   "compound": "formaldehyde",
   "tier": "primary",
   "points": [
    [
     1336.26,
     1959.48
    ],
    [
     1336.26,
     1943.48
    ],
    [
     1336.26,
     1766.54
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-cuo-oxidation|in|ethanol": {
   "reaction": "ethanol-cuo-oxidation",
   "dir": "in",
   "compound": "ethanol",
   "tier": "primary",
   "points": [
    [
     1639.72,
     1357.51
    ],
    [
     1623.72,
     1357.51
    ],
    [
     1511.72,
     1328.05
    ],
    [
     1519.72,
     1328.05
    ],
    [
     1547.72,
     1328.05
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-cuo-oxidation|out|ethanal": {
   "reaction": "ethanol-cuo-oxidation",
   "dir": "out",
   "compound": "ethanal",
   "tier": "primary",
   "points": [
    [
     1678.61,
     1223.54
    ],
    [
     1662.61,
     1223.54
    ],
    [
     1650,
     1270
    ],
    [
     1511.72,
     1328.05
    ],
    [
     1519.72,
     1328.05
    ],
    [
     1547.72,
     1328.05
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propan-2-ol-cuo-oxidation|in|propan-2-ol": {
   "reaction": "propan-2-ol-cuo-oxidation",
   "dir": "in",
   "compound": "propan-2-ol",
   "tier": "primary",
   "points": [
    [
     1852.87,
     1445.55
    ],
    [
     1852.87,
     1461.55
    ],
    [
     1858.27,
     1545.87
    ],
    [
     1930.16,
     1576.13
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propan-2-ol-cuo-oxidation|out|acetone": {
   "reaction": "propan-2-ol-cuo-oxidation",
   "dir": "out",
   "compound": "acetone",
   "tier": "primary",
   "points": [
    [
     2119.91,
     1402.46
    ],
    [
     2103.91,
     1402.46
    ],
    [
     2090,
     1480
    ],
    [
     2050,
     1540
    ],
    [
     1940,
     1560
    ],
    [
     1930,
     1570
    ],
    [
     1930.16,
     1576.13
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-dichromate-oxidation-ethanal|in|ethanol": {
   "reaction": "ethanol-dichromate-oxidation-ethanal",
   "dir": "in",
   "compound": "ethanol",
   "tier": "primary",
   "points": [
    [
     1656.68,
     1349.51
    ],
    [
     1656.68,
     1333.51
    ],
    [
     1550.51,
     1235.26
    ],
    [
     1558.51,
     1235.26
    ],
    [
     1586.51,
     1235.26
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-dichromate-oxidation-ethanal|out|ethanal": {
   "reaction": "ethanol-dichromate-oxidation-ethanal",
   "dir": "out",
   "compound": "ethanal",
   "tier": "primary",
   "points": [
    [
     1678.61,
     1218.26
    ],
    [
     1662.61,
     1218.26
    ],
    [
     1550.51,
     1218.26
    ],
    [
     1550.51,
     1235.26
    ],
    [
     1558.51,
     1235.26
    ],
    [
     1586.51,
     1235.26
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-dichromate-oxidation-acetic-acid|in|ethanol": {
   "reaction": "ethanol-dichromate-oxidation-acetic-acid",
   "dir": "in",
   "compound": "ethanol",
   "tier": "secondary",
   "points": [
    [
     1851.72,
     1380.79
    ],
    [
     1867.72,
     1380.79
    ],
    [
     1875.85,
     1427.92
    ],
    [
     1883.85,
     1427.92
    ],
    [
     1911.85,
     1427.92
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethanol-dichromate-oxidation-acetic-acid|out|acetic-acid": {
   "reaction": "ethanol-dichromate-oxidation-acetic-acid",
   "dir": "out",
   "compound": "acetic-acid",
   "tier": "secondary",
   "points": [
    [
     2119.9,
     1444.1
    ],
    [
     2103.9,
     1444.1000000000001
    ],
    [
     2090,
     1460
    ],
    [
     1940,
     1460
    ],
    [
     1875.85,
     1427.92
    ],
    [
     1883.85,
     1427.92
    ],
    [
     1911.85,
     1427.92
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "alkyne-hydration-ethyne-ethanal|in|ethyne": {
   "reaction": "alkyne-hydration-ethyne-ethanal",
   "dir": "in",
   "compound": "ethyne",
   "tier": "secondary",
   "points": [
    [
     2322.39,
     1233.58
    ],
    [
     2306.39,
     1233.58
    ],
    [
     2290,
     1210
    ],
    [
     2180,
     1200
    ],
    [
     2059.45,
     1113.23
    ],
    [
     2067.45,
     1113.23
    ],
    [
     2095.45,
     1113.23
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "alkyne-hydration-ethyne-ethanal|out|ethanal": {
   "reaction": "alkyne-hydration-ethyne-ethanal",
   "dir": "out",
   "compound": "ethanal",
   "tier": "secondary",
   "points": [
    [
     1814.61,
     1194.98
    ],
    [
     1830.61,
     1194.98
    ],
    [
     1850,
     1180
    ],
    [
     1970,
     1160
    ],
    [
     2059.45,
     1113.23
    ],
    [
     2067.45,
     1113.23
    ],
    [
     2095.45,
     1113.23
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "diazonium-substitution-benzenediazonium-chloride-phenol|in|benzenediazonium-chloride": {
   "reaction": "diazonium-substitution-benzenediazonium-chloride-phenol",
   "dir": "in",
   "compound": "benzenediazonium-chloride",
   "tier": "secondary",
   "points": [
    [
     2582.46,
     1916.84
    ],
    [
     2566.46,
     1916.84
    ],
    [
     2501.26,
     1817.41
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "diazonium-substitution-benzenediazonium-chloride-phenol|out|phenol": {
   "reaction": "diazonium-substitution-benzenediazonium-chloride-phenol",
   "dir": "out",
   "compound": "phenol",
   "tier": "secondary",
   "points": [
    [
     2501.26,
     1873.5
    ],
    [
     2501.26,
     1857.5
    ],
    [
     2465.26,
     1817.41
    ],
    [
     2473.26,
     1817.41
    ],
    [
     2501.26,
     1817.41
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "arene-hydrogenation-benzene-cyclohexane|in|benzene": {
   "reaction": "arene-hydrogenation-benzene-cyclohexane",
   "dir": "in",
   "compound": "benzene",
   "tier": "secondary",
   "points": [
    [
     2004.94,
     1338.2
    ],
    [
     2004.94,
     1322.2
    ],
    [
     2100,
     1210
    ],
    [
     2130,
     1210
    ],
    [
     2160,
     1140
    ],
    [
     2160,
     1060
    ],
    [
     2145.09,
     1038.56
    ],
    [
     2153.09,
     1038.56
    ],
    [
     2181.09,
     1038.56
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "arene-hydrogenation-benzene-cyclohexane|out|cyclohexane": {
   "reaction": "arene-hydrogenation-benzene-cyclohexane",
   "dir": "out",
   "compound": "cyclohexane",
   "tier": "secondary",
   "points": [
    [
     2255.73,
     883.89
    ],
    [
     2255.73,
     899.89
    ],
    [
     2145.28,
     1009.69
    ],
    [
     2181.09,
     1038.56
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "aromatic-side-chain-oxidation-o-xylene-phthalic-acid|in|o-xylene": {
   "reaction": "aromatic-side-chain-oxidation-o-xylene-phthalic-acid",
   "dir": "in",
   "compound": "o-xylene",
   "tier": "secondary",
   "points": [
    [
     2498.3,
     1249.23
    ],
    [
     2498.3,
     1265.23
    ],
    [
     2447.85,
     1448.66
    ],
    [
     2455.85,
     1448.66
    ],
    [
     2483.85,
     1448.66
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "aromatic-side-chain-oxidation-o-xylene-phthalic-acid|out|phthalic-acid": {
   "reaction": "aromatic-side-chain-oxidation-o-xylene-phthalic-acid",
   "dir": "out",
   "compound": "phthalic-acid",
   "tier": "secondary",
   "points": [
    [
     2473.06,
     1586.76
    ],
    [
     2473.06,
     1570.76
    ],
    [
     2440,
     1560
    ],
    [
     2440,
     1500
    ],
    [
     2450,
     1470
    ],
    [
     2447.85,
     1448.66
    ],
    [
     2455.85,
     1448.66
    ],
    [
     2483.85,
     1448.66
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "triglyceride-hydrolysis-tripalmitin-glycerol-palmitic-acid|in|tripalmitin": {
   "reaction": "triglyceride-hydrolysis-tripalmitin-glycerol-palmitic-acid",
   "dir": "in",
   "compound": "tripalmitin",
   "tier": "secondary",
   "points": [
    [
     1768.73,
     1809.57
    ],
    [
     1784.73,
     1809.57
    ],
    [
     1800,
     1830
    ],
    [
     1910,
     1830
    ],
    [
     1910.84,
     1797.57
    ],
    [
     1918.84,
     1797.57
    ],
    [
     1946.84,
     1797.57
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "triglyceride-hydrolysis-tripalmitin-glycerol-palmitic-acid|out|glycerol": {
   "reaction": "triglyceride-hydrolysis-tripalmitin-glycerol-palmitic-acid",
   "dir": "out",
   "compound": "glycerol",
   "tier": "secondary",
   "points": [
    [
     1795.43,
     1932.7
    ],
    [
     1811.43,
     1932.7
    ],
    [
     1870,
     1880
    ],
    [
     1870,
     1840
    ],
    [
     1910,
     1830
    ],
    [
     1910.84,
     1797.57
    ],
    [
     1918.84,
     1797.57
    ],
    [
     1946.84,
     1797.57
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "triglyceride-hydrolysis-tripalmitin-glycerol-palmitic-acid|out|palmitic-acid": {
   "reaction": "triglyceride-hydrolysis-tripalmitin-glycerol-palmitic-acid",
   "dir": "out",
   "compound": "palmitic-acid",
   "tier": "secondary",
   "points": [
    [
     2067.31,
     1740.86
    ],
    [
     2051.31,
     1740.86
    ],
    [
     2020,
     1760
    ],
    [
     1910.84,
     1797.57
    ],
    [
     1918.84,
     1797.57
    ],
    [
     1946.84,
     1797.57
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "triglyceride-hydrolysis-trilinolein-glycerol-linoleic-acid|in|trilinolein": {
   "reaction": "triglyceride-hydrolysis-trilinolein-glycerol-linoleic-acid",
   "dir": "in",
   "compound": "trilinolein",
   "tier": "secondary",
   "points": [
    [
     1401.8,
     2057.26
    ],
    [
     1401.8,
     2041.26
    ],
    [
     1365.8,
     1925.48
    ],
    [
     1373.8,
     1925.48
    ],
    [
     1401.8,
     1925.48
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "triglyceride-hydrolysis-trilinolein-glycerol-linoleic-acid|out|glycerol": {
   "reaction": "triglyceride-hydrolysis-trilinolein-glycerol-linoleic-acid",
   "dir": "out",
   "compound": "glycerol",
   "tier": "secondary",
   "points": [
    [
     1583.43,
     1944.7
    ],
    [
     1567.43,
     1944.7
    ],
    [
     1365.8,
     1944.7
    ],
    [
     1365.8,
     1925.48
    ],
    [
     1373.8,
     1925.48
    ],
    [
     1401.8,
     1925.48
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "triglyceride-hydrolysis-trilinolein-glycerol-linoleic-acid|out|linoleic-acid": {
   "reaction": "triglyceride-hydrolysis-trilinolein-glycerol-linoleic-acid",
   "dir": "out",
   "compound": "linoleic-acid",
   "tier": "secondary",
   "points": [
    [
     1248.64,
     1837.07
    ],
    [
     1264.64,
     1837.07
    ],
    [
     1346.26,
     1870.71
    ],
    [
     1401.8,
     1925.48
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "toluene-oxidation-benzoic-acid|in|toluene": {
   "reaction": "toluene-oxidation-benzoic-acid",
   "dir": "in",
   "compound": "toluene",
   "tier": "secondary",
   "points": [
    [
     3026.27,
     2689.59
    ],
    [
     3026.27,
     2673.59
    ],
    [
     2985.07,
     2512.4
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "toluene-oxidation-benzoic-acid|out|benzoic-acid": {
   "reaction": "toluene-oxidation-benzoic-acid",
   "dir": "out",
   "compound": "benzoic-acid",
   "tier": "secondary",
   "points": [
    [
     2990.56,
     2374.88
    ],
    [
     2990.56,
     2390.88
    ],
    [
     2949.07,
     2512.4
    ],
    [
     2957.07,
     2512.4
    ],
    [
     2985.07,
     2512.4
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzene-propene-cumene|in|benzene": {
   "reaction": "benzene-propene-cumene",
   "dir": "in",
   "compound": "benzene",
   "tier": "secondary",
   "points": [
    [
     1950.97,
     1338.2
    ],
    [
     1950.97,
     1322.2
    ],
    [
     1920,
     1310
    ],
    [
     1920,
     1250
    ],
    [
     1960,
     1170
    ],
    [
     1960,
     1070
    ],
    [
     1914.97,
     965.84
    ],
    [
     1922.97,
     965.84
    ],
    [
     1950.97,
     965.84
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzene-propene-cumene|in|propene": {
   "reaction": "benzene-propene-cumene",
   "dir": "in",
   "compound": "propene",
   "tier": "secondary",
   "points": [
    [
     1929.43,
     911.12
    ],
    [
     1929.43,
     927.12
    ],
    [
     1914.97,
     965.84
    ],
    [
     1922.97,
     965.84
    ],
    [
     1950.97,
     965.84
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzene-propene-cumene|out|cumene": {
   "reaction": "benzene-propene-cumene",
   "dir": "out",
   "compound": "cumene",
   "tier": "secondary",
   "points": [
    [
     1996.29,
     1166.3
    ],
    [
     1996.2900000000002,
     1150.3
    ],
    [
     1940,
     1040
    ],
    [
     1940,
     1030
    ],
    [
     1914.97,
     965.84
    ],
    [
     1922.97,
     965.84
    ],
    [
     1950.97,
     965.84
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzenesulfonic-acid-neutralization|in|benzenesulfonic-acid": {
   "reaction": "benzenesulfonic-acid-neutralization",
   "dir": "in",
   "compound": "benzenesulfonic-acid",
   "tier": "secondary",
   "points": [
    [
     1329.58,
     1899.12
    ],
    [
     1345.58,
     1899.12
    ],
    [
     1500,
     1890
    ],
    [
     1580,
     1970
    ],
    [
     1900,
     2060
    ],
    [
     1941.03,
     2090.94
    ],
    [
     1949.03,
     2090.94
    ],
    [
     1977.03,
     2090.94
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "benzenesulfonic-acid-neutralization|out|sodium-benzenesulfonate": {
   "reaction": "benzenesulfonic-acid-neutralization",
   "dir": "out",
   "compound": "sodium-benzenesulfonate",
   "tier": "secondary",
   "points": [
    [
     2831.44,
     2187.38
    ],
    [
     2815.44,
     2187.3799999999997
    ],
    [
     2730,
     2160
    ],
    [
     2020,
     2130
    ],
    [
     1941.03,
     2090.94
    ],
    [
     1949.03,
     2090.94
    ],
    [
     1977.03,
     2090.94
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sodium-benzenesulfonate-alkali-fusion|in|sodium-benzenesulfonate": {
   "reaction": "sodium-benzenesulfonate-alkali-fusion",
   "dir": "in",
   "compound": "sodium-benzenesulfonate",
   "tier": "secondary",
   "points": [
    [
     2956.56,
     2184.66
    ],
    [
     2956.56,
     2168.66
    ],
    [
     2963.89,
     2085.34
    ],
    [
     2971.89,
     2085.34
    ],
    [
     2999.89,
     2085.34
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sodium-benzenesulfonate-alkali-fusion|out|sodium-phenoxide": {
   "reaction": "sodium-benzenesulfonate-alkali-fusion",
   "dir": "out",
   "compound": "sodium-phenoxide",
   "tier": "secondary",
   "points": [
    [
     2842.16,
     2007.42
    ],
    [
     2858.16,
     2007.42
    ],
    [
     2963.89,
     2007.42
    ],
    [
     2963.89,
     2085.34
    ],
    [
     2971.89,
     2085.34
    ],
    [
     2999.89,
     2085.34
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyl-acetate-saponification|in|ethyl-acetate": {
   "reaction": "ethyl-acetate-saponification",
   "dir": "in",
   "compound": "ethyl-acetate",
   "tier": "secondary",
   "points": [
    [
     2197.83,
     1350.55
    ],
    [
     2181.83,
     1350.55
    ],
    [
     2160,
     1370
    ],
    [
     2100,
     1380
    ],
    [
     2010,
     1420
    ],
    [
     2013.88,
     1428.03
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyl-acetate-saponification|out|sodium-acetate": {
   "reaction": "ethyl-acetate-saponification",
   "dir": "out",
   "compound": "sodium-acetate",
   "tier": "secondary",
   "points": [
    [
     2166.18,
     1526.51
    ],
    [
     2150.18,
     1526.51
    ],
    [
     1977.88,
     1428.03
    ],
    [
     1985.88,
     1428.03
    ],
    [
     2013.88,
     1428.03
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyl-acetate-saponification|out|ethanol": {
   "reaction": "ethyl-acetate-saponification",
   "dir": "out",
   "compound": "ethanol",
   "tier": "secondary",
   "points": [
    [
     1851.72,
     1380.79
    ],
    [
     1867.72,
     1380.79
    ],
    [
     1977.88,
     1380.79
    ],
    [
     1977.88,
     1428.03
    ],
    [
     1985.88,
     1428.03
    ],
    [
     2013.88,
     1428.03
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-hydrogen-chloride|in|ethyne": {
   "reaction": "ethyne-hydrogen-chloride",
   "dir": "in",
   "compound": "ethyne",
   "tier": "secondary",
   "points": [
    [
     2399.16,
     1252.86
    ],
    [
     2399.16,
     1268.86
    ],
    [
     2360,
     1280
    ],
    [
     2330,
     1550
    ],
    [
     2340,
     1630
    ],
    [
     2390,
     1640
    ],
    [
     2399.16,
     1817.41
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-hydrogen-chloride|out|vinyl-chloride": {
   "reaction": "ethyne-hydrogen-chloride",
   "dir": "out",
   "compound": "vinyl-chloride",
   "tier": "secondary",
   "points": [
    [
     2399.16,
     2313.12
    ],
    [
     2399.16,
     2297.12
    ],
    [
     2250,
     2060
    ],
    [
     2250,
     2000
    ],
    [
     2340,
     2000
    ],
    [
     2350,
     1860
    ],
    [
     2399.16,
     1817.41
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-acetic-acid-vinyl-acetate|in|ethyne": {
   "reaction": "ethyne-acetic-acid-vinyl-acetate",
   "dir": "in",
   "compound": "ethyne",
   "tier": "secondary",
   "points": [
    [
     2333.27,
     1252.86
    ],
    [
     2333.27,
     1268.86
    ],
    [
     2340,
     1390
    ],
    [
     2340,
     1490
    ],
    [
     2300,
     1560
    ],
    [
     2180,
     1570
    ],
    [
     2120,
     1630
    ],
    [
     2080,
     1640
    ],
    [
     2070.33,
     1653.55
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-acetic-acid-vinyl-acetate|in|acetic-acid": {
   "reaction": "ethyne-acetic-acid-vinyl-acetate",
   "dir": "in",
   "compound": "acetic-acid",
   "tier": "secondary",
   "points": [
    [
     2136.86,
     1475.38
    ],
    [
     2136.86,
     1491.38
    ],
    [
     2150,
     1610
    ],
    [
     2070,
     1640
    ],
    [
     2070.33,
     1653.55
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-acetic-acid-vinyl-acetate|out|vinyl-acetate": {
   "reaction": "ethyne-acetic-acid-vinyl-acetate",
   "dir": "out",
   "compound": "vinyl-acetate",
   "tier": "secondary",
   "points": [
    [
     1983.96,
     2354.59
    ],
    [
     1983.96,
     2338.59
    ],
    [
     1950,
     2330
    ],
    [
     1960,
     2250
    ],
    [
     2050,
     2130
    ],
    [
     2050,
     1960
    ],
    [
     2110,
     1890
    ],
    [
     2100,
     1820
    ],
    [
     2060,
     1810
    ],
    [
     2060,
     1660
    ],
    [
     2070.33,
     1653.55
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethene-wacker-oxidation|in|ethene": {
   "reaction": "ethene-wacker-oxidation",
   "dir": "in",
   "compound": "ethene",
   "tier": "secondary",
   "points": [
    [
     2029.7,
     900.71
    ],
    [
     2013.7,
     900.71
    ],
    [
     1806.46,
     985.95
    ],
    [
     1814.46,
     985.95
    ],
    [
     1842.46,
     985.95
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethene-wacker-oxidation|out|ethanal": {
   "reaction": "ethene-wacker-oxidation",
   "dir": "out",
   "compound": "ethanal",
   "tier": "secondary",
   "points": [
    [
     1803.73,
     1192.26
    ],
    [
     1803.73,
     1176.26
    ],
    [
     1842.46,
     1176.26
    ],
    [
     1842.46,
     985.95
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "nylon66-acid-chloride-condensation|in|adipoyl-chloride": {
   "reaction": "nylon66-acid-chloride-condensation",
   "dir": "in",
   "compound": "adipoyl-chloride",
   "tier": "secondary",
   "points": [
    [
     1655.06,
     2937.29
    ],
    [
     1655.06,
     2921.29
    ],
    [
     1694.21,
     2820.09
    ],
    [
     1702.21,
     2820.09
    ],
    [
     1730.21,
     2820.09
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "nylon66-acid-chloride-condensation|in|hexamethylenediamine": {
   "reaction": "nylon66-acid-chloride-condensation",
   "dir": "in",
   "compound": "hexamethylenediamine",
   "tier": "secondary",
   "points": [
    [
     1730.21,
     2690.03
    ],
    [
     1730.21,
     2706.03
    ],
    [
     1694.21,
     2820.09
    ],
    [
     1702.21,
     2820.09
    ],
    [
     1730.21,
     2820.09
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "nylon66-acid-chloride-condensation|out|nylon66": {
   "reaction": "nylon66-acid-chloride-condensation",
   "dir": "out",
   "compound": "nylon66",
   "tier": "secondary",
   "points": [
    [
     1730.21,
     2903.8
    ],
    [
     1730.21,
     2887.8
    ],
    [
     1694.21,
     2820.09
    ],
    [
     1702.21,
     2820.09
    ],
    [
     1730.21,
     2820.09
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-anhydride-hydrolysis|in|acetic-anhydride": {
   "reaction": "acetic-anhydride-hydrolysis",
   "dir": "in",
   "compound": "acetic-anhydride",
   "tier": "secondary",
   "points": [
    [
     2567.22,
     1519.31
    ],
    [
     2567.2200000000003,
     1503.31
    ],
    [
     2550,
     1420
    ],
    [
     2440,
     1350
    ],
    [
     2350.16,
     1308.86
    ],
    [
     2358.16,
     1308.86
    ],
    [
     2386.16,
     1308.86
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-anhydride-hydrolysis|out|acetic-acid": {
   "reaction": "acetic-anhydride-hydrolysis",
   "dir": "out",
   "compound": "acetic-acid",
   "tier": "secondary",
   "points": [
    [
     2314.94,
     1441.38
    ],
    [
     2314.94,
     1425.38
    ],
    [
     2350.16,
     1308.86
    ],
    [
     2358.16,
     1308.86
    ],
    [
     2386.16,
     1308.86
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "maleic-anhydride-hydrolysis|in|maleic-anhydride": {
   "reaction": "maleic-anhydride-hydrolysis",
   "dir": "in",
   "compound": "maleic-anhydride",
   "tier": "secondary",
   "points": [
    [
     2119.78,
     3481.13
    ],
    [
     2119.78,
     3465.13
    ],
    [
     2083.78,
     3346.42
    ],
    [
     2091.78,
     3346.42
    ],
    [
     2119.78,
     3346.42
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "maleic-anhydride-hydrolysis|out|maleic-acid": {
   "reaction": "maleic-anhydride-hydrolysis",
   "dir": "out",
   "compound": "maleic-acid",
   "tier": "secondary",
   "points": [
    [
     1983.97,
     3381.21
    ],
    [
     1999.97,
     3381.21
    ],
    [
     2083.78,
     3346.42
    ],
    [
     2091.78,
     3346.42
    ],
    [
     2119.78,
     3346.42
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phthalic-anhydride-hydrolysis|in|phthalic-anhydride": {
   "reaction": "phthalic-anhydride-hydrolysis",
   "dir": "in",
   "compound": "phthalic-anhydride",
   "tier": "secondary",
   "points": [
    [
     2202.85,
     1802.89
    ],
    [
     2218.85,
     1802.89
    ],
    [
     2233.14,
     1817.54
    ],
    [
     2241.14,
     1817.54
    ],
    [
     2269.14,
     1817.54
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phthalic-anhydride-hydrolysis|out|phthalic-acid": {
   "reaction": "phthalic-anhydride-hydrolysis",
   "dir": "out",
   "compound": "phthalic-acid",
   "tier": "secondary",
   "points": [
    [
     2358.82,
     1620.76
    ],
    [
     2358.82,
     1636.76
    ],
    [
     2233.14,
     1636.76
    ],
    [
     2233.14,
     1817.54
    ],
    [
     2241.14,
     1817.54
    ],
    [
     2269.14,
     1817.54
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phenol-acetylation|in|phenol": {
   "reaction": "phenol-acetylation",
   "dir": "in",
   "compound": "phenol",
   "tier": "secondary",
   "points": [
    [
     2532.06,
     1888.22
    ],
    [
     2548.06,
     1888.22
    ],
    [
     2731.65,
     1888.22
    ],
    [
     2731.65,
     1846.09
    ],
    [
     2739.65,
     1846.09
    ],
    [
     2767.65,
     1846.09
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "phenol-acetylation|out|phenyl-acetate": {
   "reaction": "phenol-acetylation",
   "dir": "out",
   "compound": "phenyl-acetate",
   "tier": "secondary",
   "points": [
    [
     2954.33,
     1793.09
    ],
    [
     2938.33,
     1793.09
    ],
    [
     2731.65,
     1846.09
    ],
    [
     2739.65,
     1846.09
    ],
    [
     2767.65,
     1846.09
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetone-iodoform|in|acetone": {
   "reaction": "acetone-iodoform",
   "dir": "in",
   "compound": "acetone",
   "tier": "secondary",
   "points": [
    [
     2119.91,
     1385.9
    ],
    [
     2103.91,
     1385.9
    ],
    [
     2050,
     1360
    ],
    [
     2000,
     1320
    ],
    [
     1910,
     1310
    ],
    [
     1900,
     1250
    ],
    [
     1826.61,
     1208.12
    ],
    [
     1834.61,
     1208.12
    ],
    [
     1862.61,
     1208.12
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetone-iodoform|out|iodoform": {
   "reaction": "acetone-iodoform",
   "dir": "out",
   "compound": "iodoform",
   "tier": "secondary",
   "points": [
    [
     1393.63,
     1208.12
    ],
    [
     1409.63,
     1208.12
    ],
    [
     1500,
     1190
    ],
    [
     1820,
     1190
    ],
    [
     1826.61,
     1208.12
    ],
    [
     1834.61,
     1208.12
    ],
    [
     1862.61,
     1208.12
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propan-2-ol-iodoform|in|propan-2-ol": {
   "reaction": "propan-2-ol-iodoform",
   "dir": "in",
   "compound": "propan-2-ol",
   "tier": "secondary",
   "points": [
    [
     1727.75,
     1414.27
    ],
    [
     1711.75,
     1414.27
    ],
    [
     1690,
     1400
    ],
    [
     1390,
     1410
    ],
    [
     1354.74,
     1391.25
    ],
    [
     1362.74,
     1391.25
    ],
    [
     1390.74,
     1391.25
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "propan-2-ol-iodoform|out|iodoform": {
   "reaction": "propan-2-ol-iodoform",
   "dir": "out",
   "compound": "iodoform",
   "tier": "secondary",
   "points": [
    [
     1382.75,
     1236.59
    ],
    [
     1382.75,
     1252.59
    ],
    [
     1410,
     1290
    ],
    [
     1410,
     1350
    ],
    [
     1354.74,
     1391.25
    ],
    [
     1362.74,
     1391.25
    ],
    [
     1390.74,
     1391.25
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "aniline-hydrochloride-basification|in|aniline-hydrochloride": {
   "reaction": "aniline-hydrochloride-basification",
   "dir": "in",
   "compound": "aniline-hydrochloride",
   "tier": "secondary",
   "points": [
    [
     1303.31,
     2364.29
    ],
    [
     1303.31,
     2348.29
    ],
    [
     1350.04,
     2348.29
    ],
    [
     1350.04,
     2248.03
    ],
    [
     1358.04,
     2248.03
    ],
    [
     1386.04,
     2248.03
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "aniline-hydrochloride-basification|out|aniline": {
   "reaction": "aniline-hydrochloride-basification",
   "dir": "out",
   "compound": "aniline",
   "tier": "secondary",
   "points": [
    [
     1550.76,
     2357.2
    ],
    [
     1534.76,
     2357.2
    ],
    [
     1350.04,
     2357.2
    ],
    [
     1350.04,
     2248.03
    ],
    [
     1358.04,
     2248.03
    ],
    [
     1386.04,
     2248.03
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sodium-benzoate-acidification|in|sodium-benzoate": {
   "reaction": "sodium-benzoate-acidification",
   "dir": "in",
   "compound": "sodium-benzoate",
   "tier": "secondary",
   "points": [
    [
     3185.92,
     2178.07
    ],
    [
     3169.92,
     2178.07
    ],
    [
     3026.32,
     2178.07
    ],
    [
     3026.32,
     2202.27
    ],
    [
     3034.32,
     2202.27
    ],
    [
     3062.32,
     2202.27
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "sodium-benzoate-acidification|out|benzoic-acid": {
   "reaction": "sodium-benzoate-acidification",
   "dir": "out",
   "compound": "benzoic-acid",
   "tier": "secondary",
   "points": [
    [
     3062.32,
     2340.88
    ],
    [
     3062.32,
     2324.88
    ],
    [
     3026.32,
     2202.27
    ],
    [
     3034.32,
     2202.27
    ],
    [
     3062.32,
     2202.27
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-bromine-addition|in|ethyne": {
   "reaction": "ethyne-bromine-addition",
   "dir": "in",
   "compound": "ethyne",
   "tier": "secondary",
   "points": [
    [
     2322.39,
     1221.58
    ],
    [
     2306.39,
     1221.58
    ],
    [
     2260,
     1120
    ],
    [
     2080,
     1050
    ],
    [
     2079.08,
     1039.94
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "ethyne-bromine-addition|out|1,2-dibromoethene": {
   "reaction": "ethyne-bromine-addition",
   "dir": "out",
   "compound": "1,2-dibromoethene",
   "tier": "secondary",
   "points": [
    [
     1464.81,
     857.98
    ],
    [
     1480.81,
     857.98
    ],
    [
     1650,
     950
    ],
    [
     1760,
     960
    ],
    [
     1830,
     1020
    ],
    [
     2070,
     1030
    ],
    [
     2079.08,
     1039.94
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "dibromoethene-bromine-addition|in|1,2-dibromoethene": {
   "reaction": "dibromoethene-bromine-addition",
   "dir": "in",
   "compound": "1,2-dibromoethene",
   "tier": "secondary",
   "points": [
    [
     1339.69,
     860.7
    ],
    [
     1339.69,
     876.7
    ],
    [
     1202.92,
     1054.88
    ],
    [
     1210.92,
     1054.88
    ],
    [
     1238.92,
     1054.88
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "dibromoethene-bromine-addition|out|1,1,2,2-tetrabromoethane": {
   "reaction": "dibromoethene-bromine-addition",
   "dir": "out",
   "compound": "1,1,2,2-tetrabromoethane",
   "tier": "secondary",
   "points": [
    [
     1176.34,
     1139.56
    ],
    [
     1192.34,
     1139.56
    ],
    [
     1202.92,
     1054.88
    ],
    [
     1210.92,
     1054.88
    ],
    [
     1238.92,
     1054.88
    ]
   ],
   "gaps": [],
   "bridges": []
  },
  "acetic-acid-glycerol-esterification|in|acetic-acid": {
   "reaction": "acetic-acid-glycerol-esterification",
   "dir": "in",
   "compound": "acetic-acid",
   "tier": "secondary",
   "points": [
    [
     2119.9,
     1472.66
    ],
    [
     2103.9,
     1472.66
    ],
    [
     1920,
     1640
    ],
    [
     1742.32,
     1723.72
    ],
    [
     1750.32,
     1723.72
    ],
    [
     1778.32,
     1723.72
    ]
   ],
   "gaps": [],
   "bridges": []
  }
 },
 "canvas": {
  "x": 0,
  "y": 0,
  "w": 6058,
  "h": 3555.13
 },
 "regionFocus": {
  "hydrocarbon": {
   "x": 1012.34,
   "y": 517.09,
   "w": 1879.48,
   "h": 2159.26,
   "connected": true
  },
  "aromatic": {
   "x": 1851.82,
   "y": 1138.3,
   "w": 1327.57,
   "h": 1725.88,
   "connected": true
  },
  "alcohol-ether": {
   "x": 1342.12,
   "y": 703.48,
   "w": 1688.35,
   "h": 2483.62,
   "connected": true
  },
  "carbonyl": {
   "x": 964.17,
   "y": 1089.53,
   "w": 2385.75,
   "h": 2453.6,
   "connected": true
  },
  "ester-lipid": {
   "x": 820.28,
   "y": 1280.06,
   "w": 2476.94,
   "h": 1160.11,
   "connected": true
  },
  "phenol-aromatic": {
   "x": 925.35,
   "y": 1417.25,
   "w": 2070.09,
   "h": 1800.62,
   "connected": true
  },
  "nitrogen": {
   "x": 1150.19,
   "y": 2326.48,
   "w": 564.57,
   "h": 99.81,
   "connected": true
  },
  "sugar": {
   "x": 1057.52,
   "y": 1973.18,
   "w": 1922.35,
   "h": 819.58,
   "connected": true
  },
  "amino": {
   "x": 1041.37,
   "y": 2771.5,
   "w": 1637.3,
   "h": 568.33,
   "connected": true
  },
  "polymer": {
   "x": 784.54,
   "y": 1881.48,
   "w": 2545.06,
   "h": 1572.58,
   "connected": true
  }
 },
 "stats": {
  "layoutVersion": 1,
  "kind": "normal-proposed",
  "counts": {
   "compounds": 427,
   "connected": 158,
   "isolated": 269,
   "shelf": 269,
   "reactions": 162,
   "markers": 162,
   "routes": 375,
   "labels": 162
  },
  "collisions": {
   "nodeOverlaps": 0,
   "markerNodeCollisions": 0,
   "markerMarkerCollisions": 0,
   "labelNodeCollisions": 0,
   "labelLabelCollisions": 0,
   "labelMarkerCollisions": 0,
   "labelClassMapOverlaps": 0,
   "routeNodePenetrations": 0,
   "routeLabelPenetrations": 0,
   "routeMarkerPenetrations": 0,
   "endpointPenetrations": 0,
   "crossingPairs": 1281,
   "totalLength": 116952.65
  },
  "crossings": 1281,
  "length": {
   "count": 375,
   "total": 116952.65,
   "mean": 311.87,
   "median": 249.61,
   "p95": 756.91,
   "max": 1275.5,
   "ge1000": 8
  },
  "labels": {
   "mode": "reaction-zone",
   "solver": null,
   "targets": 162,
   "direct": 162,
   "leader": 0,
   "unresolved": 0,
   "fallback": 0,
   "fallbackIds": [],
   "leaderDropped": 0,
   "leaderActual": 0,
   "leaderShort": 0,
   "leaderExtended": 0,
   "extendedLeaderIds": [],
   "breakdown": {
    "inversion": 0,
    "strictOnly": 0,
    "other": 0,
    "fallback": 0
   },
   "inversionIds": [],
   "strictOnlyIds": [],
   "strong5": {
    "ethanol-dehydration-ethene": {
     "own": 8,
     "foreign": 22.1,
     "state": "direct"
    },
    "ethyne-full-hydrogenation": {
     "own": 8,
     "foreign": 32.29,
     "state": "direct"
    },
    "acetic-acid-sodium-carbonate": {
     "own": 8,
     "foreign": 22.04,
     "state": "direct"
    },
    "ethanol-sodium": {
     "own": 8,
     "foreign": 32.6,
     "state": "direct"
    },
    "methanol-cuo-oxidation": {
     "own": 2.55,
     "foreign": 24.56,
     "state": "direct"
    }
   },
   "missing": 0
  },
  "warnings": 1,
  "crossingsInternal": 1281,
  "compare": {
   "current": {
    "crossings": 297,
    "crossingsPP": 43,
    "crossingsPS": 159,
    "crossingsSS": 95,
    "totalLength": 77331,
    "primaryMedianLength": 125.4,
    "secondaryP95Length": 847.46,
    "maxLength": 3641.46,
    "nodePenetrations": 0,
    "labelPenetrations": 0,
    "markerPenetrations": 0,
    "hard": {
     "nodePenetrations": 0,
     "endpointPenetrations": 0,
     "labelPenetrations": 0,
     "titlePenetrations": 0,
     "markerPenetrations": 0,
     "markerNodeCollisions": 0,
     "markerMarkerCollisions": 0,
     "labelNodeCollisions": 0,
     "labelLabelCollisions": 0,
     "labelMarkerCollisions": 0,
     "labelTitleCollisions": 0,
     "nodeOverlaps": 0,
     "overlapSegments": 0,
     "overlapSegmentsSameReaction": 1,
     "crossingsPP": 43,
     "crossingsPS": 159,
     "crossingsSS": 95,
     "clearanceViolations": 72,
     "protectedCorridorViolations": 37
    }
   },
   "proposal": {
    "crossings": 1281,
    "crossingsPP": 347,
    "crossingsPS": 658,
    "crossingsSS": 276,
    "totalLength": 116953,
    "primaryMedianLength": 267.85,
    "secondaryP95Length": 817.97,
    "maxLength": 1275.5,
    "nodePenetrations": 0,
    "labelPenetrations": 0,
    "markerPenetrations": 0,
    "hard": {
     "nodePenetrations": 0,
     "endpointPenetrations": 0,
     "labelPenetrations": 0,
     "titlePenetrations": 0,
     "markerPenetrations": 0,
     "markerNodeCollisions": 0,
     "markerMarkerCollisions": 0,
     "labelNodeCollisions": 0,
     "labelLabelCollisions": 0,
     "labelMarkerCollisions": 0,
     "labelTitleCollisions": 0,
     "nodeOverlaps": 0,
     "overlapSegments": 25,
     "overlapSegmentsSameReaction": 348,
     "crossingsPP": 347,
     "crossingsPS": 658,
     "crossingsSS": 276,
     "clearanceViolations": 986,
     "protectedCorridorViolations": 346
    }
   },
   "notes": [
    "交差は metrics.cjs の events（異なる反応の枝）で数える。",
    "総辺長は現行 77331 → 案 116953 に増加。",
    "最大辺長は現行 3641.46 → 案 1275.5 に短縮。",
    "交差は現行 297 → 案 1281 に増加（zone 回避の tradeoff）。"
   ]
  }
 },
 "warnings": []
};
});
