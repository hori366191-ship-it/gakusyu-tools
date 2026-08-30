# 数学C

## ベクトル

### ベクトルの演算
- **和の交換法則**: $\vec{a}+\vec{b}=\vec{b}+\vec{a}$
- **和の結合法則**: $(\vec{a}+\vec{b})+\vec{c}=\vec{a}+(\vec{b}+\vec{c})$
- **逆ベクトル**: $\vec{a}+(-\vec{a})=\vec{0}$
- **差の定義**: $\vec{a}-\vec{b}=\vec{a}+(-\vec{b})$
- **実数倍の結合法則**: $k(l\vec{a})=(kl)\vec{a}$
- **実数倍の分配法則(1)**: $(k+l)\vec{a}=k\vec{a}+l\vec{a}$
- **実数倍の分配法則(2)**: $k(\vec{a}+\vec{b})=k\vec{a}+k\vec{b}$
- **ベクトルの和の表現**: $\vec{AB}+\vec{BC}=\vec{AC}$
- **ベクトルの差の表現**: $\vec{OB}-\vec{OA}=\vec{AB}$
- **零ベクトル**: $\vec{AA}=\vec{0}$
- **逆ベクトルの関係**: $\vec{BA}=-\vec{AB}$

### ベクトルの分解
- **平面ベクトルの分解**: $\vec{p}=s\vec{a}+t\vec{b}$
- **平面での一次独立の条件**: $s\vec{a}+t\vec{b}=\vec{0} \iff s=t=0$
- **空間ベクトルの分解**: $\vec{p}=s\vec{a}+t\vec{b}+u\vec{c}$
- **空間での一次独立の条件**: $s\vec{a}+t\vec{b}+u\vec{c}=\vec{0} \iff s=t=u=0$
- **同一平面上の条件**: $\vec{OC}=s\vec{OA}+t\vec{OB}$

### ベクトルの成分
- **平面の成分表示**: $\vec{a}=(a_1, a_2)$
- **空間の成分表示**: $\vec{a}=(a_1, a_2, a_3)$
- **成分による和**: $(a_1, a_2) + (b_1, b_2) = (a_1+b_1, a_2+b_2)$
- **成分による差**: $(a_1, a_2) - (b_1, b_2) = (a_1-b_1, a_2-b_2)$
- **成分による実数倍**: $k(a_1, a_2) = (ka_1, ka_2)$
- **零ベクトルの成分**: $\vec{0}=(0,0), \vec{0}=(0,0,0)$

### 成分とベクトルの大きさ
- **平面ベクトルの大きさ**: $|\vec{a}|=\sqrt{a_1^2+a_2^2}$
- **空間ベクトルの大きさ**: $|\vec{a}|=\sqrt{a_1^2+a_2^2+a_3^2}$
- **2点間ベクトルの成分**: $A(a_1, a_2), B(b_1, b_2)$ のとき $\vec{AB}=(b_1-a_1, b_2-a_2)$
- **2点間の距離**: $|\vec{AB}|=\sqrt{(b_1-a_1)^2+(b_2-a_2)^2}$

### ベクトルの内積
- **内積の定義**: $\vec{a} \cdot \vec{b} = |\vec{a}||\vec{b}|\cos\theta$
- **なす角**: $\cos\theta = \frac{\vec{a} \cdot \vec{b}}{|\vec{a}||\vec{b}|}$
- **同じベクトルの内積**: $\vec{a}\cdot\vec{a}=|\vec{a}|^2$
- **交換法則**: $\vec{a}\cdot\vec{b}=\vec{b}\cdot\vec{a}$
- **分配法則**: $(\vec{a}+\vec{b})\cdot\vec{c}=\vec{a}\cdot\vec{c}+\vec{b}\cdot\vec{c}$
- **実数倍**: $(k\vec{a})\cdot\vec{b}=\vec{a}\cdot(k\vec{b})=k(\vec{a}\cdot\vec{b})$
- **成分による内積（平面）**: $\vec{a} \cdot \vec{b} = a_1b_1+a_2b_2$
- **成分による内積（空間）**: $\vec{a} \cdot \vec{b} = a_1b_1+a_2b_2+a_3b_3$
- **大きさの展開公式**
    - $|\vec{a}+\vec{b}|^2 = |\vec{a}|^2 + 2\vec{a}\cdot\vec{b} + |\vec{b}|^2$
    - $|\vec{a}-\vec{b}|^2 = |\vec{a}|^2 - 2\vec{a}\cdot\vec{b} + |\vec{b}|^2$
    - $(\vec{a}+\vec{b})\cdot(\vec{a}-\vec{b}) = |\vec{a}|^2 - |\vec{b}|^2$
- **コーシー・シュワルツの不等式 <span class="tag-maniac">マニアック</span>**
    - $(a_1b_1+a_2b_2)^2 \le (a_1^2+a_2^2)(b_1^2+b_2^2)$
    - 等号成立は $\vec{a}\parallel\vec{b}$ のときです。

### ベクトルの平行・垂直
- **平行条件**: $\vec{b}=k\vec{a}$
- **垂直条件**: $\vec{a} \cdot \vec{b} = 0$
- **共線条件**: 3点A, B, Cが一直線上にある $\iff \vec{AC}=k\vec{AB}$（$\vec{AB}\parallel\vec{AC}$）
- **共面条件**: 4点A, B, C, Dが同一平面上にある $\iff \vec{AD}=s\vec{AB}+t\vec{AC}$

### ベクトルの相等と成分
- **ベクトルの相等**: $\vec{a}=\vec{b} \iff a_1=b_1, a_2=b_2, a_3=b_3$

### 三角形の面積
- **内積を用いた面積公式**: $S=\frac{1}{2}\sqrt{|\vec{a}|^2|\vec{b}|^2-(\vec{a}\cdot\vec{b})^2}$
- **成分を用いた面積公式（平面）**: $S=\frac{1}{2}|a_1b_2-a_2b_1|$
- **外積を利用した面積（空間） <span class="tag-maniac">マニアック</span>**
    - $\vec{a}\times\vec{b}$ の大きさは、$\vec{a}, \vec{b}$ が張る平行四辺形の面積に等しい。
    - $S=\frac{1}{2}|\vec{a}\times\vec{b}|$（三角形の面積）

### 位置ベクトル
- **内分点**: 線分ABを $m:n$ に内分する点 $\implies \frac{n\vec{a}+m\vec{b}}{m+n}$
- **外分点**: 線分ABを $m:n$ に外分する点 $\implies \frac{-n\vec{a}+m\vec{b}}{m-n}$
- **中点**: 線分ABの中点 $\implies \frac{\vec{a}+\vec{b}}{2}$
- **重心**: $\triangle ABC$ の重心 $\implies \frac{\vec{a}+\vec{b}+\vec{c}}{3}$
- **内心**: $\triangle ABC$ の内心 $\implies \frac{a\vec{a}+b\vec{b}+c\vec{c}}{a+b+c}$ (※$a,b,c$は対辺の長さ)

### ベクトル方程式
- **直線（点$\vec{a}$を通り、方向ベクトル$\vec{d}$）**: $\vec{p}=\vec{a}+t\vec{d}$
- **直線（2点$\vec{a}, \vec{b}$を通る）**: $\vec{p}=(1-t)\vec{a}+t\vec{b}$
- **直線（2点$\vec{a}, \vec{b}$を通る）**: $\vec{p}=s\vec{a}+t\vec{b}$ 　※s+t=1
- **直線（点$\vec{p_0}$を通り、法線ベクトル$\vec{n}$）**: $\vec{n}\cdot(\vec{p}-\vec{p_0})=0$
- **円（中心$\vec{c}$, 半径r）**: $|\vec{p}-\vec{c}|=r, \quad (\vec{p}-\vec{c}) \cdot (\vec{p}-\vec{c})=r^2$
- **平面（法線ベクトル利用）**: $a(x-x_1)+b(y-y_1)+c(z-z_1)=0$
- **点と平面の距離**
    - 点 $(x_1, y_1, z_1)$ と平面 $ax+by+cz+d=0$ の距離は $d=\frac{|ax_1+by_1+cz_1+d|}{\sqrt{a^2+b^2+c^2}}$
- **点Pが直線AB上にある条件**: $\vec{OP}=s\vec{OA}+t\vec{OB}, \quad s+t=1$
- **点Pが線分AB上にある条件**: $\vec{OP}=s\vec{OA}+t\vec{OB}, \quad s+t=1, s\ge0, t\ge0$
- **点Pが△OABの周および内部にある条件**: $\vec{OP}=s\vec{OA}+t\vec{OB}, \quad s+t\le1, s\ge0, t\ge0$

### 球の方程式
- **標準形**: 中心$(a,b,c)$, 半径$r$ $\implies (x-a)^2+(y-b)^2+(z-c)^2=r^2$
- **ベクトル表示**: $|\vec{p}-\vec{c}|=r$

## 複素数平面

### 共役な複素数の性質
- **(1) 和の共役**: $\overline{z+w} = \bar{z}+\bar{w}$
- **(2) 差の共役**: $\overline{z-w} = \bar{z}-\bar{w}$
- **(3) 積の共役**: $\overline{zw} = \bar{z}\bar{w}$
- **(4) 商の共役**: $\overline{(\frac{z}{w})} = \frac{\bar{z}}{\bar{w}}$
- **(5) 実数倍の共役**: $\overline{kz} = k\bar{z}$
- **(6) 共役の共役**: $\overline{(\bar{z})} = z$

### 複素数の絶対値の性質
- **(1) 共役複素数との積**: $z\bar{z}=|z|^2$
- **(2) 共役・反数の絶対値**: $|z|=|\bar{z}|=|-z|$
- **(3) 積の絶対値**: $|zw|=|z||w|$
- **(4) 商の絶対値**: $|\frac{z}{w}|=\frac{|z|}{|w|}$
- **(5) n乗の絶対値**: $|z^n|=|z|^n$

### 複素数の減算・商と図形
- **(1) 2点間の距離**: A($\alpha$), B($\beta$)間の距離は $|\beta-\alpha|$
- **(2) ベクトルとの対応**: $\vec{AB}$ に対応する複素数は $\beta-\alpha$
- **(3) 内分点・外分点**: 線分ABを m:n に内分する点は $\frac{n\alpha+m\beta}{m+n}$、外分する点は $\frac{-n\alpha+m\beta}{m-n}$
- **(4) 3点が一直線上にある条件**: $\frac{\gamma-\alpha}{\beta-\alpha}$ が実数
- **(5) 2直線AB, ACが垂直である条件**: $\frac{\gamma-\alpha}{\beta-\alpha}$ が純虚数

### 複素数の極形式と回転
- **極形式の表示**: $z = r(\cos\theta + i\sin\theta)$ (ただし $r=|z|, \theta=\arg z$)
- **積**: $z_1z_2=r_1r_2\\{\cos(\theta_1+\theta_2)+i\sin(\theta_1+\theta_2)\\}$
- **商**: $\frac{z_1}{z_2}=\frac{r_1}{r_2}\\{\cos(\theta_1-\theta_2)+i\sin(\theta_1-\theta_2)\\}$
- **点の回転（一般）**: 点$\beta$を点$\alpha$の周りに$\theta$回転した点$\beta'$は $\beta'-\alpha = (\beta-\alpha)(\cos\theta+i\sin\theta)$

### ド・モアブルの定理
- **(1) 定理**: $(\cos\theta + i\sin\theta)^n = \cos(n\theta) + i\sin(n\theta)$
- **(2) zのn乗**: $z^n = r^n(\cos(n\theta)+i\sin(n\theta))$
- **(3) 1のn乗根**: $\cos\frac{2k\pi}{n}+i\sin\frac{2k\pi}{n} \quad (k=0,1,2,\dots,n-1)$

### 複素数と図形
- **垂直二等分線**: $|z-\alpha|=|z-\beta|$
- **円**: $|z-\alpha|=r$
- **アポロニウスの円**: $|z-\alpha|=k|z-\beta|$
- **正三角形の条件 <span class="tag-maniac">マニアック</span>**
    - 3点A($\alpha$), B($\beta$), C($\gamma$)が正三角形である条件: $\frac{\gamma-\alpha}{\beta-\alpha} = \frac{1\pm\sqrt{3}i}{2}$
- **2直線のなす角**: $\angle BAC = \arg\frac{\gamma-\alpha}{\beta-\alpha}$

## 式と曲線

### 放物線
- **定義**: 焦点Fと準線lからの距離が等しい点の軌跡 ($PF=PH$)
- **標準形**: $y^2=4px$
- **焦点**: $(p, 0)$
- **準線**: $x=-p$
- **接線の方程式**: 点 $(x_1, y_1)$ における接線は $yy_1 = 2p(x+x_1)$

### 楕円
- **定義**: 2つの焦点F, F'からの距離の和が一定である点の軌跡 ($PF+PF'=2a$)
- **標準形**: $\frac{x^2}{a^2}+\frac{y^2}{b^2}=1 \quad (a>b>0)$
- **パラメータの関係式**: $c^2=a^2-b^2$ (ただし $c$は焦点のx座標)
- **焦点**: $(\pm c, 0)$
- **焦点からの距離の和**: $2a$
- **楕円の面積**: $S=\pi ab$
- **接線の方程式**: 点 $(x_1, y_1)$ における接線は $\frac{x_1x}{a^2}+\frac{y_1y}{b^2}=1$

### 双曲線
- **定義**: 2つの焦点F, F'からの距離の差が一定である点の軌跡 ($|PF-PF'|=2a$)
- **標準形**: $\frac{x^2}{a^2}-\frac{y^2}{b^2}=1 \quad (a>0, b>0)$
- **パラメータの関係式**: $c^2=a^2+b^2$ (ただし $c$は焦点のx座標)
- **焦点**: $(\pm c, 0)$
- **漸近線**: $y=\pm\frac{b}{a}x$
- **焦点からの距離の差**: $2a$
- **接線の方程式**: 点 $(x_1, y_1)$ における接線は $\frac{x_1x}{a^2}-\frac{y_1y}{b^2}=1$

### 曲線の平行移動
- **移動則**: $x$軸方向に$p$, $y$軸方向に$q$移動するには、$x$を$x-p$に、$y$を$y-q$に置き換える。

### 2次曲線と直線
- **共有点の個数**: 連立方程式の判別式をDとすると、$D>0 \iff 2個$, $D=0 \iff 1個$, $D<0 \iff 0個$

### 離心率と準線
- **定義**: $e=\frac{PF}{PH}$
- **楕円**: $0<e<1$
- **放物線**: $e=1$
- **双曲線**: $e>1$

### 媒介変数表示
- **放物線 $y^2=4px$**: $x=pt^2, y=2pt$
- **楕円 $\frac{x^2}{a^2}+\frac{y^2}{b^2}=1$**: $x=a\cos\theta, y=b\sin\theta$
- **双曲線 $\frac{x^2}{a^2}-\frac{y^2}{b^2}=1$**: $x=\frac{a}{\cos\theta}, y=b\tan\theta$
- **サイクロイド**: $x=a(\theta-\sin\theta), y=a(1-\cos\theta)$
- **アステロイド**: $x=a\cos^3\theta, y=a\sin^3\theta$
- **カージオイド**: $x=a(2\cos\theta-\cos2\theta), \quad y=a(2\cos\theta-\sin2\theta)$


###  極座標と極方程式
- **直交座標との関係**: $x=r\cos\theta, \quad y=r\sin\theta, \quad r^2=x^2+y^2$
- **円（中心が極、半径a）**: $r=a$
- **円（極を通り、中心が$(a,0)$）**: $r=2a\cos\theta$
- **直線（極を通り、角$\alpha$）**: $\theta=\alpha$
- **直線（極からの距離d）**: $r\cos(\theta-\alpha)=d$
- **2次曲線の統一的定義**: $r=\frac{l}{1+e\cos\theta}$ (※$e$は離心率, $l$は半直弦)