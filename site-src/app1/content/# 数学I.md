# 数学I

## 数と式

### 式の展開と因数分解
- **指数法則**
    - $a^{m}\times a^{n}=a^{m+n}$
    - $(a^{m})^{n}=a^{mn}$
    - $(ab)^n=a^n b^n$
    - $(a^0=1)$
- **展開の公式**
    - $(a+b)^{2}=a^{2}+2ab+b^{2}$
    - $(a-b)^{2}=a^{2}-2ab+b^{2}$
    - $(a+b)(a-b)=a^{2}-b^{2}$
    - $(x+a)(x+b)=x^{2}+(a+b)x+ab$
    - $(ax+b)(cx+d)=acx^{2}+(ad+bc)x+bd$
- **因数分解の公式**
    - $AB+AC=A(B+C)$
    - $a^{2}+2ab+b^{2}=(a+b)^{2}$
    - $a^{2}-2ab+b^{2}=(a-b)^{2}$
    - $a^{2}-b^{2}=(a+b)(a-b)$
    - $x^{2}+(a+b)x+ab=(x+a)(x+b)$
    - $acx^{2}+(ad+bc)x+bd=(ax+b)(cx+d)$

### 実数・平方根・不等式
- **絶対値**
    - $a \ge 0 \text{ のとき } |a|=a$
    - $a < 0 \text{ のとき } |a|=-a$
- **平方根の性質と計算**
    - $(\sqrt{a})^{2}=a, (-\sqrt{a})^{2}=a \quad (a \ge 0)$
    - $\sqrt{a^{2}}=|a|$
    - $\sqrt{a}\sqrt{b}=\sqrt{ab} \quad (a>0, b>0)$
    - $\frac{\sqrt{a}}{\sqrt{b}}=\sqrt{\frac{a}{b}} \quad (a>0, b>0)$
    - $\sqrt{k^{2}a}=k\sqrt{a} \quad (k>0, a>0)$
- **二重根号の外し方**（$a>b>0$）
    - $\sqrt{(a+b)+2\sqrt{ab}} = \sqrt{a}+\sqrt{b}$
    - $\sqrt{(a+b)-2\sqrt{ab}} = \sqrt{a}-\sqrt{b}$
- **不等式の性質**
    - $A<B \implies A+C<B+C, A-C<B-C$
    - $A<B \text{ かつ } C>0 \implies AC<BC, \frac{A}{C}<\frac{B}{C}$
    - $A<B \text{ かつ } C<0 \implies AC>BC, \frac{A}{C}>\frac{B}{C}$
- **絶対値を含む方程式・不等式**
    - $|x|=c \implies x=\pm c \quad (c>0)$
    - $|x|<c \implies -c<x<c \quad (c>0)$
    - $|x|>c \implies x<-c, c<x \quad (c>0)$

## 集合と命題

### 集合の基本
- **共通部分**:　($A \cap B$)　AとBの両方に含まれる要素全体の集合。
- **和集合**:　($A \cup B$)　AまたはBの少なくとも一方に含まれる要素全体の集合。
- **補集合**:　($\bar{A}$)　全体集合Uの中で、Aに含まれない要素全体の集合。
- **ド・モルガンの法則**
    - $\overline{A \cup B} = \bar{A} \cap \bar{B}$
    - $\overline{A \cap B} = \bar{A} \cup \bar{B}$

### 命題の基本
- **命題の逆・対偶・裏** (元の命題: $p \Rightarrow q$)
    - **逆**: $q \Rightarrow p$
    - **対偶**: $\bar{q} \Rightarrow \bar{p}$
    - **裏**: $\bar{p} \Rightarrow \bar{q}$
- **必要条件と十分条件**
    - **$p \Rightarrow q$が真** のとき、pはqの十分条件、qはpの必要条件といいます。
    - **$p \Leftrightarrow q$が真** のとき、pとqは互いに必要十分条件であるといいます。

## 2次関数

### グラフと方程式
- **標準形**
    - $y = a(x-p)^2 + q$
- **一般形**
    - $y = ax^2+bx+c$
- **一般形から頂点を求める変形**
    - $y=a(x+\frac{b}{2a})^{2}-\frac{b^{2}-4ac}{4a}$
- **最大値・最小値**（平方完成して頂点を求める）
    - $a>0$ のとき頂点で最小値、$a<0$ のとき頂点で最大値をとります。
    - 定義域に制限があるときは、軸と定義域の位置関係で場合分けします。
- **2次関数の決定**
    - 頂点・軸が与えられる場合: $y=a(x-p)^2+q$ の形から求めます。
    - 3点を通る場合: $y=ax^2+bx+c$ に代入し、連立方程式で $a, b, c$ を求めます。
    - x軸との交点が与えられる場合: $y=a(x-\alpha)(x-\beta)$ の形から求めます。
- **平行移動**
    - 点$(a,b)$ をx軸方向にp, y軸方向にq移動 $\implies (a+p, b+q)$
    - グラフ $y=f(x)$ をx軸方向にp, y軸方向にq移動 $\implies y-q=f(x-p)$
- **対称移動**

| 対称移動 | 点(a,b) | グラフ $y=f(x)$ |
|:---:|:---:|:---:|
| x軸 | $(a,-b)$ | $-y=f(x)$ |
| y軸 | $(-a,b)$ | $y=f(-x)$ |
| 原点| $(-a,-b)$| $-y=f(-x)$ |

### 2次方程式と2次不等式
- **2次方程式の解の公式**
    - $x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}$
- **判別式**
    - $D=b^2-4ac$
- **グラフとx軸の位置関係**
    - $D>0 \iff \text{異なる2点で交わる}$
    - $D=0 \iff \text{1点で接する}$
    - $D<0 \iff \text{共有点をもたない}$
- **2次不等式の解法**（$a>0$、$ax^2+bx+c=0$ の2つの解を $\alpha < \beta$ とする）
    - $ax^2+bx+c>0 \implies x<\alpha,\ \beta<x$
    - $ax^2+bx+c<0 \implies \alpha<x<\beta$
    - $ax^2+bx+c \ge 0 \implies x \le \alpha,\ \beta \le x$
    - $D<0$ かつ $a>0$ のとき、$>0$ の解はすべての実数、$<0$ の解はありません。

## 図形と計量

### 三角比の基本
- **三角比の定義**
    - $sin~\theta=\frac{y}{r}$
    - $cos~\theta=\frac{x}{r}$
    - $tan~\theta=\frac{y}{x}$
- **三角比の相互関係**
    - $sin^{2}\theta+cos^{2}\theta=1$
    - $tan~\theta=\frac{sin\theta}{cos\theta}$
    - $1+tan^{2}\theta=\frac{1}{cos^{2}\theta}$
- **有名角の三角比の値**
    - $\sin 30^\circ = \frac{1}{2}$、$\cos 30^\circ = \frac{\sqrt{3}}{2}$、$\tan 30^\circ = \frac{1}{\sqrt{3}}$
    - $\sin 45^\circ = \frac{\sqrt{2}}{2}$、$\cos 45^\circ = \frac{\sqrt{2}}{2}$、$\tan 45^\circ = 1$
    - $\sin 60^\circ = \frac{\sqrt{3}}{2}$、$\cos 60^\circ = \frac{1}{2}$、$\tan 60^\circ = \sqrt{3}$
- **角度の変換**
    - $sin(90^{\circ}-\theta)=cos~\theta$
    - $cos(90^{\circ}-\theta)=sin~\theta$
    - $tan(90^{\circ}-\theta)=\frac{1}{tan~\theta}$
    - $sin(180^{\circ}-\theta)=sin~\theta$
    - $cos(180^{\circ}-\theta)=-cos~\theta$
    - $tan(180^{\circ}-\theta)=-tan~\theta$

### 三角形の計量
- **正弦定理**
    - $\frac{a}{sinA}=\frac{b}{sinB}=\frac{c}{sinC}=2R$
- **余弦定理**
    - $a^{2}=b^{2}+c^{2}-2bc \cos A$
    - $b^{2}=c^{2}+a^{2}- 2ca \cos B$
    - $c^{2}=a^{2}+b^{2}- 2ab \cos C$
- **余弦定理の変形**（$\cos$ について解いた形）
    - $\cos A = \frac{b^2+c^2-a^2}{2bc}$
    - $\cos B = \frac{c^2+a^2-b^2}{2ca}$
    - $\cos C = \frac{a^2+b^2-c^2}{2ab}$
- **三角形の面積**
    - $S=\frac{1}{2}bc \sin A=\frac{1}{2}ca \sin B=\frac{1}{2}ab \sin C$
    - $S=\frac{1}{2}r(a+b+c)$　※ rは内接円の半径
    - $S=\frac{abc}{4R}$　※ Rは外接円の半径
- **ヘロンの公式 <span class="tag-maniac">マニアック</span>**
    - $S=\sqrt{s(s-a)(s-b)(s-c)}$（$s=\frac{a+b+c}{2}$）
- **中線定理（パップスの定理） <span class="tag-maniac">マニアック</span>**
    - $AB^2+AC^2=2(AM^2+BM^2)$（Mは辺BCの中点）
- **角の二等分線の長さ <span class="tag-maniac">マニアック</span>**
    - $AD^2=AB\cdot AC-BD\cdot DC$（ADは∠Aの二等分線）
- **トレミーの定理 <span class="tag-maniac">マニアック</span>**
    - $AC\cdot BD=AB\cdot CD+AD\cdot BC$（円に内接する四角形ABCD）

## データの分析

### 代表値と散らばり
- **平均値**
    - $\overline{x}=\frac{1}{n}(x_{1}+x_{2}+\cdot\cdot\cdot\cdot\cdot\cdot+x_{n})$
- **分散**
    - $s^{2}=\frac{1}{n}\\{(x_{1}-\overline{x})^{2}+(x_{2}-\overline{x})^{2}+\cdot\cdot\cdot\cdot\cdot+(x_{n}-\overline{x})^{2}\\}$
    - $s^{2}=\overline{x^{2}}-(\overline{x})^{2}$
- **標準偏差**
    - $s=\sqrt{s^2}$
- **共分散**
    - $s_{xy}=\frac{1}{n}\\{(x_{1}-\overline{x})(y_{1}-\overline{y})+(x_{2}-\overline{x})(y_{2}-\overline{y}) + \dots + (x_{n}-\overline{x})(y_{n}-\overline{y})\\}$
- **相関係数**
    - $r=\frac{s_{xy}}{s_{x}s_{y}}$
- **範囲と四分位数**
    - 範囲 = 最大値 − 最小値
    - 四分位数: データを小さい順に4等分する区切りの値（第1四分位数・第2四分位数＝中央値・第3四分位数）
    - 四分位範囲 = 第3四分位数 − 第1四分位数
- **箱ひげ図**: 最小値・第1四分位数・中央値・第3四分位数・最大値を箱と線で表した図です。
- **仮平均による計算** <span class="tag-maniac">マニアック</span>
    - 平均: $\overline{x} = a + \frac{1}{n}\sum_{i=1}^{n}(x_i-a)$（$a$ は仮平均）
    - 分散: $s^2 = \frac{1}{n}\sum_{i=1}^{n}(x_i-a)^2 - (\overline{x}-a)^2$
      大きな数値のデータは、仮平均 $a$ を設定すると計算が楽になります。