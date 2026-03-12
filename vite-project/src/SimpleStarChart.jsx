import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { voronoiTreemap } from 'd3-voronoi-treemap';

const SimpleStarChart = () => {
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
  const nodesRef = useRef(null);

  const scrollProgressRef = useRef(0);

  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };

    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = docHeight > 0 ? scrollTop / docHeight : 0;
      setScrollProgress(scrolled);
      scrollProgressRef.current = scrolled;
    };

    handleScroll();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const width = dimensions.width;
    const height = dimensions.height;
    const svg = d3.select(svgRef.current);
    const tooltip = d3.select(tooltipRef.current);

    const h1Element = document.querySelector('h1');
    const titleHeight = h1Element ? h1Element.offsetHeight + 20 : 70;
    const titleBottom = titleHeight + 1;

    svg.attr('width', width).attr('height', height).selectAll('*').remove();

    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#050510');

    d3.csv('/pharma_ranking_2025_cleaned.csv').then((data) => {
      const formattedData = data.map((d) => ({
        ...d,
        sales: +d.sales_million_yen,
        rd: d.rd_million_yen ? +d.rd_million_yen : 0,
      }));

      const asterias = formattedData.find((d) => d.company === 'アステラス製薬');
      if (asterias) {
        asterias.fx = width / 2;
        asterias.fy = height / 2;
      }

      const maxSales = d3.max(formattedData, (d) => d.sales);
      const minSize = Math.min(width, height) * 0.01;
      const maxSize = Math.min(width, height) * 0.1;
      const sizeScale = d3.scaleSqrt()
        .domain([0, maxSales])
        .range([minSize, maxSize]);

      const dotCenterY = titleBottom + Math.min(width, height) * 0.4;
      const simulation = d3.forceSimulation(formattedData)
        .force('charge', d3.forceManyBody().strength(-5))
        .force('center', d3.forceCenter(width / 2, dotCenterY))
        .force('collide', d3.forceCollide().radius((d) => sizeScale(d.sales) + 2))
        .alphaDecay(0.05);

      // Text is now handled by React DOM overlay.

      const glowStrength = Math.min(width, height) * 0.0015;
      const defs = svg.append('defs');

      const glowFilter = defs.append('filter').attr('id', 'glow');
      glowFilter.append('feGaussianBlur').attr('stdDeviation', glowStrength).attr('result', 'coloredBlur');
      const feMerge = glowFilter.append('feMerge');
      feMerge.append('feMergeNode').attr('in', 'coloredBlur');
      feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

      const redGlowFilter = defs.append('filter').attr('id', 'redGlow');
      redGlowFilter.append('feGaussianBlur').attr('stdDeviation', glowStrength * 2).attr('result', 'coloredBlur');
      redGlowFilter.append('feFlood').attr('flood-color', '#ff6666').attr('result', 'redColor');
      redGlowFilter.append('feComposite').attr('in', 'redColor').attr('in2', 'coloredBlur').attr('operator', 'in').attr('result', 'redBlur');
      const redMerge = redGlowFilter.append('feMerge');
      redMerge.append('feMergeNode').attr('in', 'redBlur');
      redMerge.append('feMergeNode').attr('in', 'SourceGraphic');

      const initialIsRed = scrollProgressRef.current >= 0.2;
      const initialIsBig = scrollProgressRef.current >= 0.4;
      const initialIsPie = scrollProgressRef.current >= 0.7;

      const pieGroup = svg.append('g')
        .attr('class', 'pie-chart-group')
        .attr('opacity', initialIsPie ? 1.0 : 0)
        .style('pointer-events', initialIsPie ? 'auto' : 'none');

      const hierarchyData = d3.hierarchy({
        name: 'root',
        children: [
          { region: 'United States', region2: '', value: 45.3, color: '#C0392B', textColor: '#ffffff' },
          { region: 'Established', region2: 'Markets', value: 25.4, color: '#1A6B8A', textColor: '#ffffff' },
          { region: 'Japan', region2: '', value: 14.0, color: '#D4A017', textColor: '#050510' },
          { region: 'International', region2: 'Markets', value: 10.6, color: '#1E7A5F', textColor: '#ffffff' },
          { region: 'China', region2: '', value: 4.1, color: '#C07A1A', textColor: '#ffffff' },
          { region: 'Other', region2: '', value: 0.6, color: '#6B7A8D', textColor: '#ffffff' }
        ]
      }).sum(d => d.value);

      const astellasTargetRadius = asterias ? sizeScale(asterias.sales) * 4 : 100;

      const circularClip = [];
      const numPoints = 64;
      for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        circularClip.push([
          Math.cos(angle) * astellasTargetRadius,
          Math.sin(angle) * astellasTargetRadius
        ]);
      }

      // Use a custom pseudo-random number generator (PRNG) to make the layout deterministic
      // d3-voronoi-treemap uses Math.random() by default, we override it to keep the same split.
      let seed = 42;
      const seededRandom = () => {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      };

      const vTreemap = voronoiTreemap()
        .clip(circularClip)
        .maxIterationCount(150)
        .minWeightRatio(0.01)
        .prng(seededRandom);

      vTreemap(hierarchyData);

      const nodesData = hierarchyData.leaves();

      // Let's implement the "white background showing through gaps" approach:
      // We will shrink the polygon slightly (using standard scaling), then apply a rounded stroke of the SAME color.

      const cornerRadius = 8;
      const roundedPoly = (polygon) => {
        if (polygon.length < 3) return "M" + polygon.join("L") + "Z";
        let path = "";
        for (let i = 0; i < polygon.length; i++) {
          const p1 = polygon[i];
          const p2 = polygon[(i + 1) % polygon.length];
          const p3 = polygon[(i + 2) % polygon.length];

          const dx1 = p1[0] - p2[0], dy1 = p1[1] - p2[1];
          const dx2 = p3[0] - p2[0], dy2 = p3[1] - p2[1];

          const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
          const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

          const r = Math.min(cornerRadius, len1 / 2, len2 / 2);

          const startX = p2[0] + (dx1 / len1) * r;
          const startY = p2[1] + (dy1 / len1) * r;
          const endX = p2[0] + (dx2 / len2) * r;
          const endY = p2[1] + (dy2 / len2) * r;

          if (i === 0) {
            path += `M${startX},${startY}`;
          } else {
            path += `L${startX},${startY}`;
          }
          path += `Q${p2[0]},${p2[1]} ${endX},${endY}`;
        }
        path += "Z";
        return path;
      };

      pieGroup.selectAll('path.cell')
        .data(nodesData)
        .enter()
        .append('path')
        .attr('class', 'cell')
        .attr('d', d => {
          // Shrink the polygon towards its center to create a white gap
          const centroid = d3.polygonCentroid(d.polygon);
          const shrunkenPoly = d.polygon.map(p => {
            const dx = p[0] - centroid[0];
            const dy = p[1] - centroid[1];
            const dist = Math.sqrt(dx * dx + dy * dy);
            const shrinkRatio = Math.max(0, (dist - 1.5) / dist);
            return [centroid[0] + dx * shrinkRatio, centroid[1] + dy * shrinkRatio];
          });
          return roundedPoly(shrunkenPoly);
        })
        .attr('fill', d => d.data.color)
        .attr('fill-opacity', 0.72)
        .attr('stroke', '#ffffff') // Set to white
        .attr('stroke-width', 3)   // Keep it thin to not overlap too much
        .attr('stroke-linejoin', 'round');

      const texts = pieGroup.selectAll('text')
        .data(nodesData)
        .enter()
        .append('text')
        .attr('transform', d => {
          const centroid = d3.polygonCentroid(d.polygon);
          return `translate(${centroid[0]},${centroid[1]})`;
        })
        .attr('text-anchor', 'middle')
        .attr('fill', d => d.data.textColor)
        .attr('font-size', 'clamp(9px, 1.44vw, 14px)')
        .attr('font-weight', 'bold')
        .attr('font-family', "'Georgia', serif")
        .style('pointer-events', 'none');

      texts.each(function (d) {
        if (d.data.value > 4) {
          const t = d3.select(this);
          // Show only region name and percentage (no amount)
          const lines = [d.data.region];
          if (d.data.region2) lines.push(d.data.region2);
          lines.push(`${d.data.value}%`);

          const startY = -(lines.length - 1) * 0.6 + "em";

          lines.forEach((line, i) => {
            t.append('tspan')
              .attr('x', 0)
              .attr('dy', i === 0 ? startY : '1.2em')
              .attr('font-size', i === lines.length - 1 ? '0.9em' : '1em')
              .text(line);
          });
        }
      });

      const nodes = svg.append('g')
        .selectAll('circle')
        .data(formattedData)
        .enter()
        .append('circle')
        .attr('class', (d) => d.company === 'アステラス製薬' ? 'astellas-dot' : 'other-dot')
        .attr('r', (d) => {
          d.baseR = sizeScale(d.sales);
          if (d.company === 'アステラス製薬') {
            return initialIsBig ? d.baseR * 4 : d.baseR;
          } else {
            return initialIsBig ? 0 : d.baseR;
          }
        })
        .attr('fill', (d) => (d.company === 'アステラス製薬' && initialIsRed) ? '#ff6666' : '#ffffff')
        .attr('stroke', 'none')
        .attr('opacity', (d) => {
          if (d.company === 'アステラス製薬') {
            return initialIsPie ? 0 : 1.0;
          } else {
            return initialIsBig ? 0 : 1.0;
          }
        })
        .attr('filter', (d) => (d.company === 'アステラス製薬' && initialIsRed) ? 'url(#redGlow)' : 'url(#glow)')
        .style('cursor', 'pointer')
        .style('pointer-events', () => {
          return initialIsBig ? 'none' : 'auto';
        })
        .on('mouseover', (event, d) => {
          if (scrollProgressRef.current >= 0.4) return;
          d3.select(event.currentTarget).attr('fill', '#cce6ff').attr('opacity', 1);
          tooltip.style('opacity', 1)
            .html(`<strong>${d.company_en || d.company}</strong><br/><span style="font-size: 12px; color: #ccc;">Revenue: ¥${Math.round(d.sales / 100).toLocaleString()}B</span>`);
        })
        .on('mousemove', (event) => {
          tooltip.style('left', `${event.clientX + 15}px`).style('top', `${event.clientY - 25}px`);
        })
        .on('mouseout', (event, d) => {
          const isRed = scrollProgressRef.current >= 0.2;
          const isBig = scrollProgressRef.current >= 0.4;
          const isPie = scrollProgressRef.current >= 0.7;

          let targetOpacity = 1.0;
          if (d.company === 'アステラス製薬') {
            targetOpacity = isPie ? 0 : 1.0;
          } else {
            targetOpacity = isBig ? 0 : 1.0;
          }

          d3.select(event.currentTarget)
            .attr('fill', (d.company === 'アステラス製薬' && isRed) ? '#ff6666' : '#ffffff')
            .attr('opacity', targetOpacity);
          tooltip.style('opacity', 0);
        });

      nodesRef.current = nodes;

      // Label inside the big Astellas dot
      const astellasLabel = svg.append('g')
        .attr('class', 'astellas-label')
        .attr('opacity', initialIsBig && !initialIsPie ? 1 : 0)
        .style('pointer-events', 'none');

      astellasLabel.append('text')
        .attr('text-anchor', 'middle')
        .attr('fill', '#ffffff')
        .attr('font-family', "'Georgia', serif")
        .attr('font-size', 'clamp(12px, 1.7vw, 20px)')
        .attr('font-weight', '300')
        .attr('letter-spacing', '1px')
        .attr('dy', '-0.8em')
        .text('Total Revenue in FY25');

      // Astellas sales in billions of JPY: asterias.sales is in million yen, /100 = billions
      const astellasSalesB = asterias ? Math.round(asterias.sales / 100).toLocaleString() : '—';
      astellasLabel.append('text')
        .attr('text-anchor', 'middle')
        .attr('fill', '#ffffff')
        .attr('font-family', "'Georgia', serif")
        .attr('font-size', 'clamp(18px, 2.8vw, 36px)')
        .attr('font-weight', 'bold')
        .attr('dy', '0.9em')
        .text(`¥${astellasSalesB}B`);

      const yMin = titleBottom + 5;
      const yMax = height - 20;
      simulation.on('tick', () => {
        nodes
          .attr('cx', (d) => (d.x = Math.max(sizeScale(d.sales), Math.min(width - sizeScale(d.sales), d.x))))
          .attr('cy', (d) => (d.y = Math.max(yMin + sizeScale(d.sales), Math.min(yMax - sizeScale(d.sales), d.y))));

        if (asterias) {
          const shiftY = scrollProgressRef.current >= 0.4 ? height * 0.11 : 0;
          const labelX = asterias.x;
          const labelY = asterias.y - shiftY;

          // Move the label group along with the big dot
          svg.select('.astellas-label')
            .attr('transform', `translate(${labelX}, ${labelY})`);

          // Add a white background circle for the pie chart to match the reference
          if (pieGroup.select('.pie-bg').empty()) {
            pieGroup.insert('circle', ':first-child')
              .attr('class', 'pie-bg')
              .attr('cx', 0)
              .attr('cy', 0)
              .attr('r', astellasTargetRadius + 2)
              .attr('fill', '#f8f9fa')
              .attr('stroke', '#cccccc')
              .attr('stroke-width', 0.5);
          }
          pieGroup.attr('transform', `translate(${asterias.x},${asterias.y - shiftY})`);
        }
      });
    }).catch((error) => {
      console.error('CSV Load Error:', error);
    });

    return () => {
      svg.selectAll('*').remove();
    };
  }, [dimensions]);

  useEffect(() => {
    if (!svgRef.current) return;

    const isRed = scrollProgress >= 0.2;
    const isBig = scrollProgress >= 0.4;
    const isPie = scrollProgress >= 0.7;
    const svg = d3.select(svgRef.current);
    const shiftY = isBig ? dimensions.height * 0.11 : 0;

    svg.selectAll('.other-dot')
      .transition().duration(600)
      .attr('opacity', isBig ? 0 : 1.0)
      .attr('r', (d) => isBig ? 0 : d.baseR)
      .style('pointer-events', isBig ? 'none' : 'auto');

    svg.selectAll('.astellas-dot')
      .transition().duration(600)
      .attr('filter', isRed ? 'url(#redGlow)' : 'url(#glow)')
      .attr('fill', isRed ? '#ff6666' : '#ffffff')
      .attr('r', (d) => isBig ? d.baseR * 4 : d.baseR)
      .attr('transform', `translate(0, -${shiftY})`)
      .attr('opacity', isPie ? 0 : 1.0);

    svg.selectAll('.astellas-dot').each(function (d) {
      svg.selectAll('.pie-chart-group')
        .transition().duration(600)
        .attr('transform', `translate(${d.x}, ${d.y - shiftY})`)
        .attr('opacity', isPie ? 1.0 : 0)
        .style('pointer-events', isPie ? 'auto' : 'none');
    });

    // Show/hide and position the label inside the big dot
    const astellasDotEl = svg.select('.astellas-dot');
    if (!astellasDotEl.empty()) {
      const cx = +astellasDotEl.attr('cx');
      const cy = +astellasDotEl.attr('cy');
      if (!isNaN(cx) && !isNaN(cy)) {
        svg.selectAll('.astellas-label')
          .attr('transform', `translate(${cx}, ${cy - shiftY})`);
      }
    }
    svg.selectAll('.astellas-label')
      .transition().duration(600)
      .attr('opacity', isBig && !isPie ? 1 : 0);

  }, [scrollProgress, dimensions.height]);

  return (
    <div style={{ position: 'relative', width: '100vw', minHeight: '600vh' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, pointerEvents: 'none' }}>
        <h1 style={{
          position: 'fixed',
          top: '20px',
          left: 0, // ★修正: 40pxから0に変更
          right: 0, // ★修正: rightも0にすることで画面幅全体を指定
          margin: 0,
          padding: '0 20px', // ★修正: 左右に最低限の余白を確保
          color: '#fff',
          textAlign: 'center', // ★修正: 中央揃えに変更
          zIndex: 100,
          fontSize: 'clamp(22px, 4.8vw, 51px)',
          fontFamily: "'Georgia', serif",
          fontWeight: '300',
          letterSpacing: '2px'
        }}>
          A Star in a Pharma Nebula
        </h1>
        <svg ref={svgRef} style={{ display: 'block', pointerEvents: 'auto' }}></svg>
      </div>

      <div
        style={{
          position: 'fixed', bottom: '18%', left: '50%',
          transform: `translate(-50%, ${scrollProgress >= 0.2 && scrollProgress < 0.4 ? '0' : '150%'})`,
          opacity: scrollProgress >= 0.2 && scrollProgress < 0.4 ? 0.95 : 0,
          background: 'rgba(50, 55, 65, 0.85)', padding: '20px 40px', borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.2)', color: '#ffffff',
          fontSize: 'clamp(11px, 1.6vw, 16px)', fontFamily: "'Georgia', serif", textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(8px)',
          transition: 'all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)', pointerEvents: 'none', zIndex: 50,
          width: 'max-content', maxWidth: '90vw', lineHeight: '1.6',
        }}
      >
        <div style={{ marginBottom: '8px' }}>
          Each dot represents the sales volume of a domestic pharmaceutical company.
        </div>
        <div>
          Among them, <span style={{ color: '#ff6666', fontWeight: 'bold' }}>Astellas Pharma</span> is one of the major players in the industry.
        </div>
      </div>

      <div
        style={{
          position: 'fixed', bottom: '18%', left: '50%',
          transform: `translate(-50%, ${scrollProgress >= 0.7 ? '0' : '150%'})`,
          opacity: scrollProgress >= 0.7 ? 0.95 : 0,
          background: 'rgba(50, 55, 65, 0.85)', padding: '20px 40px', borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.2)', color: '#ffffff',
          fontSize: 'clamp(11px, 1.6vw, 16px)', fontFamily: "'Georgia', serif", textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(8px)',
          transition: 'all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)', pointerEvents: 'none', zIndex: 50,
          width: 'max-content', maxWidth: '90vw', lineHeight: '1.6',
        }}
      >
        <div style={{ marginBottom: '8px', color: '#ff99b3', fontWeight: 'bold' }}>
          Astellas Pharma Revenue Breakdown
        </div>
        <div style={{ fontSize: '0.8em', color: '#ccc' }}>
          The majority of revenue comes from overseas markets, especially the US.
        </div>
      </div>

      <div
        ref={tooltipRef}
        style={{
          position: 'fixed', opacity: 0, background: 'rgba(10, 15, 30, 0.9)',
          padding: '10px 15px', border: '1px solid #445588', borderRadius: '6px',
          pointerEvents: 'none', color: '#fff', fontSize: '14px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.5)', transition: 'opacity 0.2s ease', zIndex: 10,
        }}
      ></div>
    </div>
  );
};

export default SimpleStarChart;