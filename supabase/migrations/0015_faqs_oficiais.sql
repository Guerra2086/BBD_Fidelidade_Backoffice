-- Substitui as 5 FAQ provisórias (migração 0010) pelas 11 FAQ oficiais fornecidas pela
-- Fidelidade/ENTRAJUDA. Seguro de repetir (apaga tudo e insere de novo).

delete from faqs;

insert into faqs (pergunta, resposta, ordem) values
  (
    'A submissão do pedido garante a atribuição dos artigos?',
    'Não. Os pedidos são sujeitos a confirmação e não constituem aceitação, reserva ou autorização de levantamento dos artigos. O pedido será analisado no prazo máximo de 72 horas úteis. Receberá um email com a confirmação de atribuição e quantidades por artigo, até ao limite do stock existente.',
    1
  ),
  (
    'Posso alterar ou cancelar o pedido depois de o submeter?',
    'Caso necessite de alterar ou cancelar o seu pedido, deverá contactar-nos com a maior brevidade possível. Utilize o formulário de contacto disponível no final da página onde deve indicar os seus dados, a referência do pedido e as alterações pretendidas. Aguarde a confirmação de alteração do seu pedido.',
    2
  ),
  (
    'O pedido pode ser aceite apenas parcialmente?',
    'Sim. Caso não seja possível atribuir todos os materiais ou quantidades solicitadas, poderá receber uma proposta de atribuição parcial, sujeita à sua confirmação.',
    3
  ),
  (
    'Como posso entregar o donativo associado ao meu pedido?',
    'O valor do donativo correspondente ao seu pedido apenas deverá ser entregue no momento da recolha dos artigos e poderá ser efetuado por Multibanco, MB WAY ou dinheiro. Não são aceites donativos antecipados para manifestar interesse, analisar ou reservar pedidos. O valor total do donativo a entregar à ENTRAJUDA é comunicado previamente e corresponde aos artigos com os quais o Colaborador decide prosseguir. Não serão cobrados montantes ou encargos adicionais que não tenham sido previamente comunicados e aceites.',
    4
  ),
  (
    'Posso usar o meu email pessoal para a submissão de pedidos?',
    'Não. Apenas serão aceites pedidos apresentados com um endereço de email cuja terminação seja das empresas de grupo Fidelidade, designadamente: @fidelidade.pt; @fidelidade-assistance.pt; @multicare.pt; @viadirecta.pt; @redefineasy.pt; @gepsa.pt; @vetsobrerodas.pt. Ficam automaticamente excluídos todos os pedidos recebidos através de outros domínios, ainda que o pedido seja efetuado por um colaborador Fidelidade.',
    5
  ),
  (
    'Existe um limite máximo de quantidades por artigo?',
    'Sim. Existe um limite máximo de unidades por cada artigo que um colaborador pode adquirir, que será devidamente indicado antes da submissão do pedido. Estes limites são comuns a todos os colaboradores e não poderão ser ultrapassados através da submissão de vários pedidos em separado. Não é permitida a utilização da identidade de terceiros nem a apresentação de pedidos duplicados para contornar limites. Os limites de quantidade por Colaborador ou por pedido, quando existam, serão divulgados antes da submissão final do pedido.',
    6
  ),
  (
    'Qual o estado de conservação dos artigos?',
    'Os artigos apresentados são usados e, como tal, podem apresentar sinais de desgaste, marcas de utilização e diferenças de tonalidade ou acabamento. O estado de conservação de cada artigo é identificado como “Grade”. Os artigos, ainda que pertencentes à mesma “Grade”, poderão apresentar diferenças estéticas.',
    7
  ),
  (
    'Caso não pretenda os artigos no ato de recolha, posso desistir do pedido?',
    'Sim. A decisão final de levantamento do pedido é tomada presencialmente, após a verificação dos artigos apresentados. Caso não pretenda aceitar a unidade apresentada, pode desistir antes de pagar, sem penalização. A desistência determina a libertação dos artigos abrangidos e não confere o direito de escolher ou trocar por outra unidade, mesmo quando existam mais artigos da mesma tipologia em stock.',
    8
  ),
  (
    'O que acontece se não puder recolher o pedido na data acordada?',
    'Deverá informar a equipa responsável com a maior antecedência possível. A possibilidade de reagendamento dependerá da disponibilidade logística e das condições definidas para a iniciativa. A impossibilidade de comparecer deve ser comunicada à ENTRAJUDA antes da hora marcada. O reagendamento depende dos horários disponíveis e das condições logísticas, não sendo garantido. A falta de comparência sem aviso ou o incumprimento do agendamento pode determinar o cancelamento da reserva.',
    9
  ),
  (
    'Caso não consiga recolher a totalidade do meu pedido de uma só vez, poderei fazer mais do que uma deslocação ao armazém?',
    'Sim. Se necessário, por questões logísticas, poderá efetuar mais do que uma deslocação ao armazém dentro do horário selecionado. Nesse caso, deverá informar a nossa equipa no momento da recolha.',
    10
  ),
  (
    'Os artigos podem ser devolvidos após a sua recolha?',
    'Não. Após a recolha dos artigos e entrega do donativo, não serão aceites devoluções.',
    11
  );
